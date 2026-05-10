import re
import copy   # FIX: moved from inside _fetch_with_soup to module level
import time
import hashlib
import requests
from bs4 import BeautifulSoup
from typing import List, Dict, Any, Optional, Set, Tuple
from datetime import datetime
from difflib import SequenceMatcher
from urllib.parse import urljoin, urlparse, urlencode, parse_qs, urlunparse
from urllib.robotparser import RobotFileParser
import unicodedata

# ═══════════════════════════════════════════════════════
# CONSTANTS
# ═══════════════════════════════════════════════════════

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0 Safari/537.36"
    )
}

JUNK_TAGS = [
    "script", "style", "noscript", "form", "iframe",
]

# These tags may contain pagination links — strip only for text extraction,
# not from the soup used for pagination detection.
NAV_TAGS_TEXT_ONLY = ["header", "footer", "nav", "aside"]

DEDUP_THRESHOLD    = 0.85
MAX_PAGES_PER_SITE = 10

RETRY_COUNT      = 3
RETRY_BACKOFF    = 2.0
REQUEST_TIMEOUT  = 20
CRAWL_DELAY      = 1.5
MAX_RETRY_AFTER  = 120

SOFT_BLOCK_PHRASES = [
    "access denied",
    "403 forbidden",
    "captcha",
    "are you a robot",
    "enable javascript",
    "please verify you are a human",
    "ddos protection",
    "checking your browser",
    "cloudflare",
    "rate limit exceeded",
    "too many requests",
    "blocked",
    "security check",
]


# ═══════════════════════════════════════════════════════
# CUSTOM EXCEPTIONS
# ═══════════════════════════════════════════════════════

class SoftBlockError(Exception):
    """Raised when a site returns 200 OK but the body is a block/CAPTCHA page."""


# ═══════════════════════════════════════════════════════
# NORMALIZER
# ═══════════════════════════════════════════════════════

class Normalizer:

    TERM_MAP = {
        r"\bscholarships?\b":        "scholarship",
        r"\bgrants?\b":              "grant",
        r"\bfinancial\s+aids?\b":    "financial aid",
        r"\bdeadlines?\b":           "deadline",
        r"\bapplicants?\b":          "applicant",
        r"\beligibilit(y|ies)\b":    "eligibility",
        r"\baward(?:ed)?\b":         "award",
        r"\bundergrad(?:uate)?\b":   "undergraduate",
        r"\bgrad(?:uate)?\b":        "graduate",
        r"\bphd\b":                  "PhD",
        r"\bgpa\b":                  "GPA",
        r"\bfafsa\b":                "FAFSA",
        r"\busa\b|\bu\.s\.a?\b":     "United States",
        r"\buk\b|\bu\.k\.\b":        "United Kingdom",
    }

    _CP1252 = str.maketrans({
        "\x80": "€",  "\x82": ",",  "\x83": "f",  "\x84": "„",
        "\x85": "…",  "\x86": "†",  "\x87": "‡",  "\x88": "ˆ",
        "\x89": "‰",  "\x8a": "Š",  "\x8b": "‹",  "\x8c": "Œ",
        "\x91": "'",  "\x92": "'",  "\x93": "\u201c", "\x94": "\u201d",
        "\x95": "•",  "\x96": "–",  "\x97": "—",  "\x99": "™",
        "\x9a": "š",  "\x9b": "›",  "\x9c": "œ",  "\xa0": " ",
    })

    @classmethod
    def normalize(cls, text: str) -> str:
        text = text.translate(cls._CP1252)
        text = unicodedata.normalize("NFKD", text)
        text = text.encode("ascii", "ignore").decode("ascii")
        text = (text
                .replace("&amp;",  "&")
                .replace("&nbsp;", " ")
                .replace("&lt;",   "<")
                .replace("&gt;",   ">")
                .replace("&apos;", "'")
                .replace("&quot;", '"'))
        text = re.sub(r"[ \t]+",       " ",    text)
        text = re.sub(r"\n[ \t]*\n+",  "\n\n", text)
        lines = [l for l in text.split("\n") if cls._is_informative(l)]
        return "\n".join(lines).strip()

    @staticmethod
    def _is_informative(line: str) -> bool:
        s = line.strip()
        if len(s) < 15:
            return False
        if re.match(r"^[\W\d]+$", s):
            return False
        nav_patterns = [
            r"^(home|about|contact|menu|search|login|sign\s*up|subscribe)$",
            r"^(click here|read more|learn more|see more|view all)$",
            r"^\d+\s*(results?|items?|scholarships?)$",
            r"^page\s*\d+",
        ]
        for pat in nav_patterns:
            if re.match(pat, s, re.IGNORECASE):
                return False
        return True

    @classmethod
    def fingerprint(cls, text: str) -> str:
        fp = text.lower()
        for pattern, replacement in cls.TERM_MAP.items():
            fp = re.sub(pattern, replacement.lower(), fp, flags=re.IGNORECASE)
        fp = re.sub(r"\s+", " ", fp).strip()
        return hashlib.sha256(fp.encode()).hexdigest()


# ═══════════════════════════════════════════════════════
# DEDUPLICATOR
# ═══════════════════════════════════════════════════════

class Deduplicator:

    def __init__(self, threshold: float = DEDUP_THRESHOLD):
        self.threshold      = threshold
        self._fingerprints: set       = set()
        self._seen_texts:   List[str] = []

    def is_duplicate(self, text: str) -> bool:
        fp = Normalizer.fingerprint(text)

        # Layer 1 — exact hash
        if fp in self._fingerprints:
            return True

        # Layer 2 — fuzzy similarity against recent 200 chunks
        normalised_slice = Normalizer.normalize(text)[:300].lower()
        for seen in self._seen_texts[-200:]:
            if SequenceMatcher(None, normalised_slice, seen).ratio() >= self.threshold:
                return True

        # Unique: commit to state
        self._fingerprints.add(fp)
        self._seen_texts.append(normalised_slice)
        return False

    def reset(self):
        self._fingerprints.clear()
        self._seen_texts.clear()

    @property
    def unique_count(self) -> int:
        return len(self._fingerprints)


# ═══════════════════════════════════════════════════════
# INCREMENTAL TRACKER
# ═══════════════════════════════════════════════════════

class IncrementalTracker:

    def __init__(self):
        self._hashes:       Dict[str, str] = {}
        self._last_scraped: Dict[str, str] = {}

    def has_changed(self, url: str, text: str) -> bool:
        new_hash = hashlib.sha256(text.encode()).hexdigest()
        changed  = self._hashes.get(url) != new_hash
        if changed:
            self._hashes[url]       = new_hash
            self._last_scraped[url] = datetime.utcnow().isoformat()
        return changed

    def status(self) -> Dict[str, Any]:
        return {
            url: {
                "hash":         h[:12] + "…",
                "last_scraped": self._last_scraped.get(url, "never"),
            }
            for url, h in self._hashes.items()
        }


# ═══════════════════════════════════════════════════════
# ROBOTS.TXT CACHE
# ═══════════════════════════════════════════════════════

class RobotsCache:

    def __init__(self):
        self._parsers:     Dict[str, RobotFileParser] = {}
        self._crawl_delay: Dict[str, float]           = {}

    def _get_parser(self, origin: str) -> RobotFileParser:
        if origin not in self._parsers:
            rp = RobotFileParser()
            rp.set_url(f"{origin}/robots.txt")
            try:
                rp.read()
            except Exception:
                pass
            self._parsers[origin]     = rp
            delay = rp.crawl_delay(HEADERS["User-Agent"]) or CRAWL_DELAY
            self._crawl_delay[origin] = float(delay)
        return self._parsers[origin]

    def can_fetch(self, url: str) -> bool:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        rp     = self._get_parser(origin)
        return rp.can_fetch(HEADERS["User-Agent"], url)

    def delay(self, url: str) -> float:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        self._get_parser(origin)
        return self._crawl_delay.get(origin, CRAWL_DELAY)


# ═══════════════════════════════════════════════════════
# PAGINATION DETECTOR
# ═══════════════════════════════════════════════════════

class PaginationDetector:

    NEXT_TEXT = re.compile(
        r"^(next|next\s*page|›|»|→|forward|more\s*results?|older\s*posts?)$",
        re.IGNORECASE,
    )
    KNOWN_PAGE_PARAMS = re.compile(
        r"[?&/](page|p|pg|start|offset|pagenum|current_page|pg_num|paged|pageno|pageNo|num)[=/](\d+)",
        re.IGNORECASE,
    )
    ANY_NUMERIC_PARAM = re.compile(r"[?&]([a-z_][a-z0-9_]*)=(\d+)", re.IGNORECASE)
    PATH_NUMBER       = re.compile(r"^(.*/)(\d+)/?$")
    NEXT_CLASS        = re.compile(
        r"\b(next|pagination[\-_]next|page[\-_]next|nextpage|nav[\-_]next)\b",
        re.IGNORECASE,
    )

    @classmethod
    def find_next_page(
        cls,
        soup: BeautifulSoup,
        current_url: str,
        visited: Set[str],
    ) -> Optional[str]:
        parsed = urlparse(current_url)
        base   = f"{parsed.scheme}://{parsed.netloc}"

        candidates: List[Tuple[str, str]] = []

        # Strategy 1: rel="next"
        tag = soup.find("a", rel=re.compile(r"\bnext\b", re.I))
        if tag and tag.get("href"):
            url = cls._safe_join(base, tag["href"])
            if url:
                candidates.append((url, "rel=next"))

        # Strategy 6: aria-label
        tag = soup.find("a", attrs={"aria-label": re.compile(r"\bnext\b", re.I)})
        if tag and tag.get("href"):
            url = cls._safe_join(base, tag["href"])
            if url:
                candidates.append((url, "aria-label"))

        # Strategy 7: CSS class
        tag = soup.find("a", class_=cls.NEXT_CLASS)
        if tag and tag.get("href"):
            url = cls._safe_join(base, tag["href"])
            if url:
                candidates.append((url, "CSS class"))

        # Strategy 2: anchor text
        for a in soup.find_all("a", href=True):
            txt = a.get_text(strip=True)
            if cls.NEXT_TEXT.match(txt):
                url = cls._safe_join(base, a["href"])
                if url:
                    candidates.append((url, f"anchor '{txt}'"))
                    break

        current_num = cls._detect_page_number(current_url)

        if current_num is not None:
            next_num = current_num + 1

            # Strategy 3: known param — explicit link first
            for a in soup.find_all("a", href=True):
                m = cls.KNOWN_PAGE_PARAMS.search(a["href"])
                if m and int(m.group(2)) == next_num:
                    url = cls._safe_join(base, a["href"])
                    if url:
                        candidates.append((url, f"known param page={next_num}"))
                        break

            # Strategy 3 fallback: build URL
            incremented = cls._increment_known_param(current_url, current_num, next_num)
            if incremented:
                candidates.append((incremented, f"param increment → {next_num}"))

        # Strategy 4: any numeric param (explicit links only)
        for a in soup.find_all("a", href=True):
            result = cls._strategy_any_numeric_param_link(a["href"], current_url, base)
            if result:
                candidates.append(result)
                break

        # Strategy 5: bare path number (explicit links only)
        result = cls._strategy_path_number_link(soup, current_url, base, parsed)
        if result:
            candidates.append(result)

        for url, label in candidates:
            if url.rstrip("/") not in visited and url != current_url:
                print(f"      🔗 Pagination via {label} → {url}")
                return url

        return None

    @classmethod
    def _strategy_any_numeric_param_link(
        cls, href: str, current_url: str, base: str
    ) -> Optional[Tuple[str, str]]:
        qs     = urlparse(current_url).query
        params = parse_qs(qs)

        for param_name, values in params.items():
            if not values or not values[0].isdigit():
                continue
            current_val = int(values[0])
            next_val    = current_val + 1
            pattern = re.compile(
                rf"[?&]{re.escape(param_name)}=(\d+)", re.IGNORECASE
            )
            m = pattern.search(href)
            if m and int(m.group(1)) == next_val:
                url = cls._safe_join(base, href)
                if url:
                    return (url, f"param '{param_name}' → {next_val}")
        return None

    @classmethod
    def _strategy_path_number_link(
        cls,
        soup: BeautifulSoup,
        current_url: str,
        base: str,
        parsed,
    ) -> Optional[Tuple[str, str]]:
        m = cls.PATH_NUMBER.match(parsed.path)
        if not m:
            return None

        base_path   = m.group(1)
        current_num = int(m.group(2))
        next_path   = f"{base_path}{current_num + 1}"

        for a in soup.find_all("a", href=True):
            href_path = urlparse(a["href"]).path
            if href_path == next_path:
                url = cls._safe_join(base, a["href"])
                if url:
                    return (url, f"path number {current_num} → {current_num + 1}")
        return None

    @classmethod
    def _detect_page_number(cls, url: str) -> Optional[int]:
        m = cls.KNOWN_PAGE_PARAMS.search(url)
        if m:
            return int(m.group(2))
        return None

    @staticmethod
    def _increment_known_param(url: str, current: int, next_page: int) -> Optional[str]:
        new_url, n = re.subn(
            r"([?&/](?:page|p|pg|start|offset|pagenum|current_page|pg_num|paged|pageno|pageNo|num)[=/])(\d+)",
            lambda m: m.group(1) + str(next_page),
            url,
            flags=re.IGNORECASE,
        )
        return new_url if n else None

    @staticmethod
    def _safe_join(base: str, href: str) -> Optional[str]:
        href = href.strip()
        if not href or href.startswith(("#", "mailto:", "javascript:", "tel:")):
            return None
        return urljoin(base, href)


# ═══════════════════════════════════════════════════════
# WEB SCRAPER
# ═══════════════════════════════════════════════════════

class WebScraper:

    def __init__(self, max_pages: int = MAX_PAGES_PER_SITE):
        self.max_pages    = max_pages
        self.normalizer   = Normalizer()
        self.deduplicator = Deduplicator()
        self.tracker      = IncrementalTracker()
        self.robots       = RobotsCache()

    # ─── public API ───────────────────────────────────────

    def scrape_urls(self, urls: List[str]) -> List[Dict[str, Any]]:
        self.deduplicator.reset()
        all_chunks: List[Dict[str, Any]] = []
        results: Dict[str, str] = {}

        for url in urls:
            domain = self._domain(url)
            print(f"\n🌐 [{domain}] Starting crawl…")
            try:
                chunks = self._crawl_site(url)
                all_chunks.extend(chunks)
                results[domain] = f"✅ {len(chunks)} chunks"
                print(f"   → {len(chunks)} unique chunks from this site")
            except SoftBlockError as e:
                results[domain] = f"🚫 soft block: {e}"
                print(f"   🚫 [{domain}] Soft block detected — {e}")
            except Exception as e:
                results[domain] = f"❌ error: {e}"
                print(f"   ❌ [{domain}] Failed — {e}")

        print(f"\n📦 Total chunks this run: {len(all_chunks)}")
        print("📋 Per-site summary:")
        for domain, status in results.items():
            print(f"   {domain}: {status}")

        return all_chunks

    def scrape_urls_with_report(self, urls: List[str]) -> Dict[str, Any]:
        self.deduplicator.reset()
        all_chunks: List[Dict[str, Any]] = []
        report: Dict[str, Any] = {}

        for url in urls:
            domain = self._domain(url)
            try:
                chunks = self._crawl_site(url)
                all_chunks.extend(chunks)
                report[domain] = {"status": "ok", "chunks": len(chunks)}
            except SoftBlockError as e:
                report[domain] = {"status": "soft_block", "reason": str(e)}
            except Exception as e:
                report[domain] = {"status": "error", "reason": str(e)}

        return {"chunks": all_chunks, "report": report}

    def incremental_status(self) -> Dict[str, Any]:
        return self.tracker.status()

    # ─── site crawler ─────────────────────────────────────

    def _crawl_site(self, start_url: str) -> List[Dict[str, Any]]:
        visited:    Set[str]             = set()
        all_chunks: List[Dict[str, Any]] = []
        current_url: Optional[str]       = start_url
        page_num = 1

        while current_url and page_num <= self.max_pages:
            normalised = current_url.rstrip("/")
            if normalised in visited:
                print(f"   ⏭️  Already visited — stopping")
                break

            if not self.robots.can_fetch(current_url):
                print(f"   🚫 Blocked by robots.txt: {current_url}")
                break

            visited.add(normalised)
            print(f"   📄 Page {page_num}: {current_url}")

            try:
                soup, raw_text = self._fetch_with_retry(current_url)
            except SoftBlockError as e:
                print(f"   🚫 Soft block on page {page_num} — stopping crawl for this site ({e})")
                break
            except Exception as exc:
                print(f"   ❌ Fetch failed after retries: {exc}")
                break

            if not self.tracker.has_changed(current_url, raw_text):
                print(f"   ⏭️  Page unchanged — skipping content")
            else:
                chunks = self._process_page(current_url, raw_text)
                all_chunks.extend(chunks)
                print(f"      ✂️  {len(chunks)} chunks kept")

            # FIX: Detect next page BEFORE reassigning current_url,
            #      so pagination detection still has the correct current URL.
            next_url = PaginationDetector.find_next_page(soup, current_url, visited)

            if not next_url:
                print(f"   ✅ No more pages after page {page_num}")
                break

            # FIX: Compute politeness delay for the page we JUST fetched (current_url),
            #      not the next one. Reassign only after computing the delay.
            delay = self.robots.delay(current_url)

            current_url = next_url
            page_num   += 1

            time.sleep(delay)

        if page_num > self.max_pages:
            print(f"   ⚠️  Hit max page limit ({self.max_pages})")

        return all_chunks

    # ─── fetch with retry ─────────────────────────────────

    def _fetch_with_retry(self, url: str) -> Tuple[BeautifulSoup, str]:
        last_exc: Exception = RuntimeError("No attempts made")
        delay = RETRY_BACKOFF

        for attempt in range(1, RETRY_COUNT + 1):
            try:
                soup, text = self._fetch_with_soup(url)

                preview = text[:2000].lower()
                matched = [p for p in SOFT_BLOCK_PHRASES if p in preview]
                if matched and len(text.strip()) < 3000:
                    raise SoftBlockError(
                        f"page looks like a block (matched: {matched[0]!r}, "
                        f"body length: {len(text)})"
                    )

                return soup, text

            except SoftBlockError:
                raise

            except requests.exceptions.HTTPError as e:
                code = e.response.status_code if e.response is not None else 0

                if code == 429:
                    retry_after = e.response.headers.get("Retry-After", "")
                    wait = min(float(retry_after), MAX_RETRY_AFTER) if retry_after.isdigit() else delay
                    print(f"      ⏳ 429 Rate limited — waiting {wait:.0f}s before retry {attempt}/{RETRY_COUNT}")
                    time.sleep(wait)
                    delay *= 2
                    last_exc = e
                    continue

                if 400 <= code < 500:
                    raise

                last_exc = e

            except (requests.exceptions.ConnectionError,
                    requests.exceptions.Timeout,
                    requests.exceptions.ChunkedEncodingError) as e:
                last_exc = e

            if attempt < RETRY_COUNT:
                print(f"      ⚠️  Attempt {attempt} failed ({last_exc}), retrying in {delay:.0f}s…")
                time.sleep(delay)
                delay *= 2

        raise last_exc

    # ─── per-page pipeline ────────────────────────────────

    def _process_page(self, url: str, raw_text: str) -> List[Dict[str, Any]]:
        clean_text = Normalizer.normalize(raw_text)
        raw_chunks = self._chunk(clean_text)

        unique: List[str] = []
        for chunk in raw_chunks:
            if not self.deduplicator.is_duplicate(chunk):
                unique.append(chunk)

        removed = len(raw_chunks) - len(unique)
        if removed:
            print(f"      🔁 {removed} duplicate chunks removed")

        domain     = self._domain(url)
        scraped_at = datetime.utcnow().isoformat()

        return [
            {
                "text":          chunk,
                "url":           url,
                "source_domain": domain,
                "scraped_at":    scraped_at,
            }
            for chunk in unique
        ]

    # ─── fetch ────────────────────────────────────────────

    @staticmethod
    def _fetch_with_soup(url: str) -> Tuple[BeautifulSoup, str]:
        resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()

        # Parse full page — pagination detection needs nav/header tags
        soup = BeautifulSoup(resp.content, "html.parser")

        # FIX: import copy is now at the module level — no repeated import here
        soup_for_text = copy.copy(soup)

        for tag in soup_for_text(JUNK_TAGS + NAV_TAGS_TEXT_ONLY):
            tag.decompose()

        body = (
            soup_for_text.find("main") or
            soup_for_text.find("article") or
            soup_for_text.find(id=re.compile(r"content|main|body", re.I)) or
            soup_for_text.find(class_=re.compile(r"content|main|body", re.I)) or
            soup_for_text.body or
            soup_for_text
        )

        return soup, body.get_text(separator="\n")

    # ─── paragraph-aware chunker ──────────────────────────

    @staticmethod
    def _chunk(
        text: str,
        chunk_size: int = 800,
        overlap:    int = 150,
        min_len:    int = 80,
    ) -> List[str]:
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        chunks:  List[str] = []
        current: str       = ""

        for para in paragraphs:
            if current and len(current) + len(para) + 2 > chunk_size:
                if len(current) >= min_len:
                    chunks.append(current.strip())
                tail    = current[-overlap:] if len(current) > overlap else current
                current = (tail + "\n\n" + para).strip()
            else:
                current = (current + "\n\n" + para).strip() if current else para

        if current.strip() and len(current) >= min_len:
            chunks.append(current.strip())

        return chunks

    # ─── helpers ──────────────────────────────────────────

    @staticmethod
    def _domain(url: str) -> str:
        m = re.search(r"https?://(?:www\.)?([^/]+)", url)
        return m.group(1) if m else url