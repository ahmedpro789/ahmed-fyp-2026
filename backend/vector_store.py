import threading
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Any, Optional
import hashlib
import os

# ═══════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════
PERSIST_DIR     = os.path.join(os.path.dirname(__file__), "chroma_db")
COLLECTION_NAME = "scraped_pages"
EMBED_MODEL     = "all-MiniLM-L6-v2"


class VectorStore:

    def __init__(self):
        print(f"[VectorStore] ChromaDB path: {PERSIST_DIR}")
        self._client = chromadb.PersistentClient(
            path=PERSIST_DIR,
            settings=Settings(anonymized_telemetry=False),
        )
        self._collection = self._client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

        # FIX: Lock for clear() to prevent concurrent queries from crashing
        #      while the collection is being deleted and recreated.
        self._lock = threading.Lock()

        # FIX: Lazy-load the embedding model so startup is non-blocking.
        #      The model is loaded on first use, not in __init__.
        self._model: Optional[SentenceTransformer] = None
        print("[VectorStore] Ready (embedding model loads on first use)")

    # ─── internal: lazy model loader ──────────────────────

    def _get_model(self) -> SentenceTransformer:
        if self._model is None:
            print("[VectorStore] Loading embedding model...")
            self._model = SentenceTransformer(EMBED_MODEL)
            print("[VectorStore] Embedding model loaded")
        return self._model

    # ─── write ────────────────────────────────────────────

    def add_chunks(
        self,
        chunks: List[str],
        url: str,
        metadata_extra: Optional[Dict[str, str]] = None,
    ) -> int:
        """
        Embed and upsert chunks.
        FIX: Removed the per-chunk get() existence loop — ChromaDB upsert is
             already idempotent (same ID → overwrites). The loop was O(n) round
             trips that provided zero benefit.
        Returns number of chunks passed to upsert (all treated as new or updated).
        """
        if not chunks:
            return 0

        model = self._get_model()

        try:
            embeddings = model.encode(
                chunks, show_progress_bar=False, batch_size=32
            ).tolist()
        except Exception as exc:
            print(f"[VectorStore] Embedding failed: {exc}")
            raise

        ids = [self._make_id(url, i, chunk) for i, chunk in enumerate(chunks)]

        base_meta = {"url": url}
        if metadata_extra:
            base_meta.update(metadata_extra)

        metadatas = [{**base_meta, "chunk_index": i} for i in range(len(chunks))]

        with self._lock:
            self._collection.upsert(
                ids=ids,
                documents=chunks,
                embeddings=embeddings,
                metadatas=metadatas,
            )

        return len(chunks)

    def clear(self) -> None:
        # FIX: Acquire lock so no in-flight query hits the deleted collection
        with self._lock:
            self._client.delete_collection(COLLECTION_NAME)
            self._collection = self._client.get_or_create_collection(
                name=COLLECTION_NAME,
                metadata={"hnsw:space": "cosine"},
            )
        print("[VectorStore] Cleared")

    # ─── read ─────────────────────────────────────────────

    def query(self, question: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """
        Embed the question and return the top-k most similar chunks.
        Returns: [{text, url, source_domain, scraped_at, score}, …]
        """
        with self._lock:
            count = self._collection.count()
            if count == 0:
                return []

            model = self._get_model()
            q_emb = model.encode([question], show_progress_bar=False).tolist()[0]

            results = self._collection.query(
                query_embeddings=[q_emb],
                n_results=min(top_k, count),
                include=["documents", "metadatas", "distances"],
            )

        hits = []
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            hits.append({
                "text":          doc,
                "url":           meta.get("url", ""),
                "source_domain": meta.get("source_domain", ""),
                "scraped_at":    meta.get("scraped_at", ""),
                "score":         round(1 - dist, 4),
            })

        return hits

    def count(self) -> int:
        with self._lock:
            return self._collection.count()

    # ─── helpers ──────────────────────────────────────────

    @staticmethod
    def _make_id(url: str, index: int, text: str) -> str:
        # FIX: Use text[:200] instead of text[:50] to reduce hash collision probability
        h = hashlib.md5(f"{url}::{index}::{text[:200]}".encode()).hexdigest()[:12]
        return f"chunk_{h}"