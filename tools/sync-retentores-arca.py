#!/usr/bin/env python3
"""Sincroniza automaticamente referências Sabó x ARCA.

Estratégia:
- consulta o catálogo público por dígitos 0..9 (todo código ARCA/Sabó é numérico);
- extrai apenas linhas que possuem uma referência Sabó reconhecível;
- deduplica aplicações repetidas mantendo uma referência técnica por combinação
  Sabó + ARCA + medidas;
- agrega montadoras/linhas/aplicações em campos auxiliares;
- só substitui o arquivo local se a coleta parecer completa e consistente.

O script foi desenhado para GitHub Actions. Nenhuma ação manual no catálogo é
necessária depois de publicar o repositório.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "retentores-sabo-arca.json"
URL = "https://www.arcaretentores.com.br/produtos?q={term}"
TERMS = list("0123456789")
MIN_UNIQUE = 350

SABO_RE = re.compile(r"(?<!\d)(\d{3,6}\s*-\s*[A-Z][A-Z0-9]{0,10})(?![A-Z0-9])", re.I)


def clean(v: object) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()


def norm_header(v: str) -> str:
    return (
        clean(v)
        .lower()
        .replace("º", "")
        .replace("°", "")
        .replace("ø", "")
        .replace(".", "")
    )


def sabo_codes(raw: str) -> list[str]:
    out = []
    for m in SABO_RE.finditer(clean(raw).upper()):
        code = re.sub(r"\s+", "", m.group(1))
        if code not in out:
            out.append(code)
    return out


def session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=4,
        connect=4,
        read=4,
        backoff_factor=1.1,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
    )
    s.mount("https://", HTTPAdapter(max_retries=retry, pool_connections=4, pool_maxsize=4))
    s.headers.update(
        {
            "User-Agent": "Mozilla/5.0 (compatible; KleimpaulCatalogSync/3.0; +https://github.com/)",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
        }
    )
    return s


def find_table(soup: BeautifulSoup):
    best = None
    best_score = -1
    for table in soup.find_all("table"):
        text = norm_header(table.get_text(" ", strip=True))
        score = sum(
            key in text
            for key in ("arca", "material", "ref sb", "eixo", "aloj", "alt")
        )
        if score > best_score:
            best, best_score = table, score
    return best if best_score >= 4 else None


def header_map(table) -> dict[str, int]:
    ths = table.find_all("th")
    headers = [norm_header(x.get_text(" ", strip=True)) for x in ths]
    # Algumas versões usam cabeçalho em duas linhas; preferimos a linha com mais THs.
    rows = []
    for tr in table.find_all("tr")[:5]:
        h = [norm_header(x.get_text(" ", strip=True)) for x in tr.find_all("th")]
        if h:
            rows.append(h)
    if rows:
        headers = max(rows, key=len)

    def idx(*needles: str, default: int | None = None):
        for i, h in enumerate(headers):
            if all(n in h for n in needles):
                return i
        return default

    # Fallback é a ordem usada atualmente pelo site ARCA.
    return {
        "arca": idx("arca", default=0),
        "type": idx("tipo", default=1),
        "material": idx("material", default=2),
        "line": idx("linha", default=3),
        "maker": idx("montadora", default=4),
        "original": idx("original", default=5),
        "sabo": idx("ref", "sb", default=6),
        "corteco": idx("ref", "ct", default=7),
        "application": idx("aplica", default=8),
        "model": idx("modelo", default=9),
        "shaft": idx("eixo", default=10),
        "housing": idx("aloj", "ext1", default=11),
        "housing2": idx("aloj", "ext2", default=12),
        "height": idx("alt", "1", default=13),
        "height2": idx("alt", "2", default=14),
        "launch": idx("lanc", default=15),
    }


def cell(cells: list[str], i: int | None) -> str:
    if i is None or i < 0 or i >= len(cells):
        return ""
    return clean(cells[i])


def parse_page(html: str, term: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    table = find_table(soup)
    if table is None:
        raise RuntimeError(f"Tabela de produtos não encontrada para q={term}")
    hm = header_map(table)
    out = []
    for tr in table.find_all("tr"):
        cells = [clean(td.get_text(" ", strip=True)) for td in tr.find_all("td")]
        if len(cells) < 10:
            continue
        arca = cell(cells, hm["arca"])
        raw_sabo = cell(cells, hm["sabo"])
        if not arca:
            continue
        refs = sabo_codes(raw_sabo)
        if not refs:
            continue
        base = {
            "arcaCode": arca,
            "retType": cell(cells, hm["type"]),
            "material": cell(cells, hm["material"]),
            "retLine": cell(cells, hm["line"]),
            "montadora": cell(cells, hm["maker"]),
            "original": cell(cells, hm["original"]),
            "corteco": cell(cells, hm["corteco"]),
            "aplicacao": cell(cells, hm["application"]),
            "modelo": cell(cells, hm["model"]),
            "shaft": cell(cells, hm["shaft"]),
            "housing": cell(cells, hm["housing"]),
            "housing2": cell(cells, hm["housing2"]),
            "height": cell(cells, hm["height"]),
            "height2": cell(cells, hm["height2"]),
            "lancamento": cell(cells, hm["launch"]),
            "orientation": "",
            "active": True,
            "officialSource": "ARCA",
        }
        for sabo in refs:
            out.append({**base, "saboCode": sabo})
    return out


def key_for(x: dict) -> str:
    raw = "|".join(
        clean(x.get(k, "")).upper()
        for k in ("arcaCode", "saboCode", "shaft", "housing", "housing2", "height", "height2")
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]


def aggregate(rows: list[dict]) -> list[dict]:
    grouped: dict[str, dict] = {}
    extras: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
    for row in rows:
        k = key_for(row)
        if k not in grouped:
            grouped[k] = dict(row)
            grouped[k]["sourceKey"] = k
        ex = extras[k]
        for src, dest in (
            ("retLine", "lines"),
            ("montadora", "makers"),
            ("original", "originals"),
            ("aplicacao", "applications"),
            ("modelo", "models"),
        ):
            v = clean(row.get(src, ""))
            if v:
                ex[dest].add(v)
    items = []
    for k, item in grouped.items():
        ex = extras[k]
        for dest in ("lines", "makers", "originals", "applications", "models"):
            vals = sorted(ex.get(dest, set()))
            # Evita JSON exagerado: busca técnica usa principalmente código e medida.
            item[dest] = vals[:24]
        items.append(item)
    items.sort(key=lambda x: (x["saboCode"].upper(), x["arcaCode"].upper(), x.get("shaft", "")))
    return items


def load_previous() -> dict:
    try:
        return json.loads(OUT.read_text(encoding="utf-8"))
    except Exception:
        return {}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--terms", default="".join(TERMS), help="termos usados na varredura; padrão 0123456789")
    ap.add_argument("--min", type=int, default=MIN_UNIQUE, help="mínimo de referências únicas para aceitar a atualização")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    previous = load_previous()
    s = session()
    raw_rows: list[dict] = []
    stats = {}

    for term in dict.fromkeys(args.terms):
        url = URL.format(term=term)
        print(f"Consultando {url}")
        r = s.get(url, timeout=(15, 120))
        r.raise_for_status()
        page_rows = parse_page(r.text, term)
        stats[term] = len(page_rows)
        raw_rows.extend(page_rows)
        print(f"  {len(page_rows)} linhas com referência Sabó")
        time.sleep(0.35)

    items = aggregate(raw_rows)
    if len(items) < args.min:
        old_count = int(previous.get("count") or 0)
        raise RuntimeError(
            f"Coleta retornou apenas {len(items)} referências únicas (mínimo {args.min}). "
            f"Arquivo anterior com {old_count} itens foi preservado."
        )

    canonical = json.dumps(items, ensure_ascii=False, separators=(",", ":"))
    payload = {
        "schemaVersion": 3,
        "source": "https://www.arcaretentores.com.br/produtos?q=",
        "sourceLabel": "Catálogo técnico Sabó × ARCA",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(items),
        "bootstrap": False,
        "automatic": True,
        "terms": list(dict.fromkeys(args.terms)),
        "queryStats": stats,
        "sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        "items": items,
    }
    print(f"TOTAL: {len(items)} referências Sabó × ARCA únicas")
    if args.dry_run:
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(OUT)
    print(f"Gravado em {OUT}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        raise
