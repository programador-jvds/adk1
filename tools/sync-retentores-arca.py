#!/usr/bin/env python3
"""Gera a base Sabó x ARCA automaticamente.

Fontes, em ordem:
1) catálogo público ARCA arquivado em HTML (170 páginas, dividido em 4 faixas);
2) página de lançamentos ARCA atual;
3) PDFs de linhas ARCA atuais (quando disponíveis).

Somente registros com referência Sabó reconhecida entram no JSON público.
O arquivo anterior só é substituído quando a coleta passa por validações fortes.
"""
from __future__ import annotations

import argparse
import hashlib
import io
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

ARCHIVE_URLS = [
    "https://pubhtml5.com/lwdy/rlqp/basic/",
    "https://pubhtml5.com/lwdy/rlqp/basic/51-100",
    "https://pubhtml5.com/lwdy/rlqp/basic/101-150",
    "https://pubhtml5.com/lwdy/rlqp/basic/151-170",
]
LAUNCHES_URL = "https://www.arcaretentores.com.br/lancamentos"
PDF_URLS = [
    "https://www.arcaretentores.com.br/assets/file/upload/downloads/4pdnh3UMqEu51Bg7.pdf",
    "https://www.arcaretentores.com.br/assets/file/upload/downloads/aNDKNWIyTjcUrdMy.pdf",
    "https://www.arcaretentores.com.br/assets/file/upload/downloads/7jZO5SGcwt75BPKT.pdf",
    "https://www.arcaretentores.com.br/assets/file/upload/downloads/38rrFunNTGq6WXPR.pdf",
    "https://www.arcaretentores.com.br/assets/file/upload/downloads/UV7UsG2Fo3VXLlak.pdf",
    "https://www.arcaretentores.com.br/assets/file/upload/downloads/ruqKVdACT609n36J.pdf",
]

# O catálogo histórico possui milhares de aplicações repetidas. Após deduplicar
# Sabó+ARCA+medidas, esperamos muitas centenas de equivalências distintas.
MIN_UNIQUE = 650

# ARCA + três dimensões principais. Aceita código com ou sem sufixo.
ARCA_DIM_RE = re.compile(
    r"(?<!\d)(?P<arca>\d{4,5}(?:-[A-Z]{1,9})?)\s+"
    r"(?P<shaft>\d{1,3}(?:[.,]\d{1,2})?)\s*[Xx×]\s*"
    r"(?P<housing>\d{1,3}(?:[.,]\d{1,2})?)"
    r"(?:\s*/\s*(?P<housing2>\d{1,3}(?:[.,]\d{1,2})?))?\s*[Xx×]\s*"
    r"(?P<height>\d{1,3}(?:[.,]\d{1,2})?)"
    r"(?:\s*/\s*(?P<height2>\d{1,3}(?:[.,]\d{1,2})?))?",
    re.I,
)
# Referências Sabó vistas nos catálogos usam cinco dígitos e um sufixo técnico.
SABO_RE = re.compile(r"(?<!\d)(\d{5})\s*[- ]\s*([A-Z][A-Z0-9]{0,10})(?![A-Z0-9])", re.I)


def clean(v: object) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()


def num(v: str) -> str:
    v = clean(v).replace(".", ",")
    return v


def normalize_sabo(a: str, b: str) -> str:
    return f"{a}-{b}".upper().replace(" ", "")


def session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=5,
        connect=5,
        read=5,
        backoff_factor=1.2,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET"]),
    )
    s.mount("https://", HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=8))
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; KleimpaulCatalogSync/5.0; +https://github.com/)",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    })
    return s


def archive_rows(html: str, source: str) -> list[dict]:
    text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
    text = text.replace("º", "°")
    matches = list(ARCA_DIM_RE.finditer(text))
    out: list[dict] = []
    for i, m in enumerate(matches):
        tail_end = matches[i + 1].start() if i + 1 < len(matches) else min(len(text), m.end() + 900)
        # Não deixe uma célula muito grande capturar outra página inteira.
        tail = text[m.end():min(tail_end, m.end() + 850)]
        refs = []
        for a, b in SABO_RE.findall(tail):
            code = normalize_sabo(a, b)
            if code not in refs:
                refs.append(code)
        if not refs:
            continue
        arca = clean(m.group("arca")).upper()
        typ = arca.split("-", 1)[1] if "-" in arca else ""
        base = {
            "arcaCode": arca,
            "retType": typ,
            "material": "",
            "retLine": "",
            "montadora": "",
            "original": "",
            "corteco": "",
            "aplicacao": "",
            "modelo": "",
            "shaft": num(m.group("shaft")),
            "housing": num(m.group("housing")),
            "housing2": num(m.group("housing2") or ""),
            "height": num(m.group("height")),
            "height2": num(m.group("height2") or ""),
            "lancamento": "",
            "orientation": "",
            "active": True,
            "officialSource": "ARCA",
            "sourceDataset": source,
        }
        for ref in refs:
            out.append({**base, "saboCode": ref})
    return out


def parse_launches(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    out: list[dict] = []
    # A página atual usa tabela. Parseia pelas células para manter as colunas exatas.
    for tr in soup.find_all("tr"):
        cells = [clean(x.get_text(" ", strip=True)) for x in tr.find_all("td")]
        if len(cells) < 13:
            continue
        arca = cells[0].upper()
        if not re.fullmatch(r"\d{4,5}(?:-[A-Z]{1,9})?", arca):
            continue
        raw_sabo = cells[6] if len(cells) > 6 else ""
        refs = [normalize_sabo(a, b) for a, b in SABO_RE.findall(raw_sabo)]
        if not refs:
            continue
        base = {
            "arcaCode": arca,
            "retType": cells[1] if len(cells) > 1 else "",
            "material": cells[2] if len(cells) > 2 else "",
            "retLine": cells[3] if len(cells) > 3 else "",
            "montadora": cells[4] if len(cells) > 4 else "",
            "original": cells[5] if len(cells) > 5 else "",
            "corteco": cells[7] if len(cells) > 7 else "",
            "aplicacao": cells[8] if len(cells) > 8 else "",
            "modelo": cells[9] if len(cells) > 9 else "",
            "shaft": num(cells[10] if len(cells) > 10 else ""),
            "housing": num(cells[11] if len(cells) > 11 else ""),
            "height": num(cells[12] if len(cells) > 12 else ""),
            "housing2": num(cells[13] if len(cells) > 13 else ""),
            "height2": num(cells[14] if len(cells) > 14 else ""),
            "lancamento": cells[15] if len(cells) > 15 else "",
            "orientation": "",
            "active": True,
            "officialSource": "ARCA",
            "sourceDataset": "lancamentos-atual",
        }
        for ref in dict.fromkeys(refs):
            out.append({**base, "saboCode": ref})
    return out


def pdf_text_rows(pdf_bytes: bytes, source: str) -> list[dict]:
    """Extrai equivalências dos PDFs atuais. Falha silenciosamente se pdfplumber não existir."""
    try:
        import pdfplumber  # type: ignore
    except Exception:
        return []
    out: list[dict] = []
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text(x_tolerance=2, y_tolerance=3) or ""
                if text:
                    # Preserva separações de linha e adiciona espaços para o parser genérico.
                    out.extend(archive_rows(text, source))
    except Exception as exc:
        print(f"Aviso: PDF {source} não pôde ser lido: {exc}")
    return out


def key_for(x: dict) -> str:
    raw = "|".join(clean(x.get(k, "")).upper() for k in (
        "arcaCode", "saboCode", "shaft", "housing", "housing2", "height", "height2"
    ))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]


def aggregate(rows: list[dict]) -> list[dict]:
    grouped: dict[str, dict] = {}
    source_sets: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        if not row.get("saboCode") or not row.get("arcaCode"):
            continue
        k = key_for(row)
        src = clean(row.get("sourceDataset", ""))
        if k not in grouped:
            grouped[k] = dict(row)
            grouped[k]["sourceKey"] = k
        else:
            # Dados atuais têm precedência sobre o arquivo histórico.
            old = grouped[k]
            current = row.get("sourceDataset") == "lancamentos-atual"
            if current:
                for field, value in row.items():
                    if clean(value) or field in {"active"}:
                        old[field] = value
            else:
                for field, value in row.items():
                    if not clean(old.get(field, "")) and clean(value):
                        old[field] = value
        if src:
            source_sets[k].add(src)

    items = []
    for k, item in grouped.items():
        item["datasets"] = sorted(source_sets[k])
        items.append(item)
    items.sort(key=lambda x: (x["saboCode"].upper(), x["arcaCode"].upper(), x.get("shaft", "")))
    return items


def load_previous() -> dict:
    try:
        return json.loads(OUT.read_text(encoding="utf-8"))
    except Exception:
        return {}


def self_test() -> None:
    sample = (
        "5000-BA 30,00 X 62,00 X 10,00 01273-BA 2011 N 0,79 "
        "5045-BRG 40,00 X 55,00 X 8,00 01707-BRG / 02391-BRG 39090006-6 0,67 "
        "54368-BAGS 40,00 X 60,00 X 10,00 00185-BA 6025.008.049.00.0"
    )
    rows = archive_rows(sample, "teste")
    pairs = {(x["arcaCode"], x["saboCode"]) for x in rows}
    expected = {
        ("5000-BA", "01273-BA"),
        ("5045-BRG", "01707-BRG"),
        ("5045-BRG", "02391-BRG"),
        ("54368-BAGS", "00185-BA"),
    }
    assert expected.issubset(pairs), (expected, pairs)
    print(f"Self-test OK: {len(rows)} equivalências de teste")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--min", type=int, default=MIN_UNIQUE)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--self-test-only", action="store_true")
    args = ap.parse_args()

    self_test()
    if args.self_test_only:
        return 0

    previous = load_previous()
    s = session()
    all_rows: list[dict] = []
    stats: dict[str, int] = {}
    errors: list[str] = []

    # Catálogo amplo arquivado — fonte principal para equivalências Sabó x ARCA.
    for i, url in enumerate(ARCHIVE_URLS, 1):
        name = f"arca-arquivo-{i}"
        try:
            print(f"Baixando {url}")
            r = s.get(url, timeout=(20, 180))
            r.raise_for_status()
            found = archive_rows(r.text, name)
            stats[name] = len(found)
            all_rows.extend(found)
            print(f"  {len(found)} equivalências")
        except Exception as exc:
            errors.append(f"{name}: {exc}")
            print(f"Aviso: {errors[-1]}")
        time.sleep(0.4)

    # Lançamentos atuais — atualiza e adiciona referências recentes.
    try:
        print(f"Baixando {LAUNCHES_URL}")
        r = s.get(LAUNCHES_URL, timeout=(20, 120))
        r.raise_for_status()
        found = parse_launches(r.text)
        # Caso o HTML servido mude e o parser de tabela não veja TDs, usa parser genérico.
        if len(found) < 5:
            found = archive_rows(r.text, "lancamentos-atual")
        stats["lancamentos-atual"] = len(found)
        all_rows.extend(found)
        print(f"  {len(found)} equivalências atuais")
    except Exception as exc:
        errors.append(f"lancamentos-atual: {exc}")
        print(f"Aviso: {errors[-1]}")

    # Catálogos de linha atuais: reforço, não ponto único de falha.
    for i, url in enumerate(PDF_URLS, 1):
        name = f"arca-pdf-linha-{i}"
        try:
            print(f"Baixando PDF {i}/{len(PDF_URLS)}")
            r = s.get(url, timeout=(20, 180))
            r.raise_for_status()
            found = pdf_text_rows(r.content, name)
            stats[name] = len(found)
            all_rows.extend(found)
            print(f"  {len(found)} equivalências do PDF")
        except Exception as exc:
            errors.append(f"{name}: {exc}")
            print(f"Aviso: {errors[-1]}")

    items = aggregate(all_rows)
    if len(items) < args.min:
        old_count = int(previous.get("count") or 0)
        raise RuntimeError(
            f"Coleta retornou {len(items)} equivalências únicas; mínimo de segurança é {args.min}. "
            f"A base anterior ({old_count}) foi preservada. Erros: {'; '.join(errors[:5])}"
        )

    # Sanidade extra: precisamos de variedade real, não uma única página repetida.
    arca_unique = len({x["arcaCode"] for x in items})
    sabo_unique = len({x["saboCode"] for x in items})
    if arca_unique < 450 or sabo_unique < 450:
        raise RuntimeError(f"Base suspeita: {arca_unique} ARCA únicos e {sabo_unique} Sabó únicos")

    canonical = json.dumps(items, ensure_ascii=False, separators=(",", ":"))
    payload = {
        "schemaVersion": 4,
        "source": "ARCA - catálogo amplo + lançamentos atuais",
        "sourceLabel": "Catálogo técnico Sabó × ARCA",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(items),
        "uniqueArca": arca_unique,
        "uniqueSabo": sabo_unique,
        "bootstrap": False,
        "automatic": True,
        "queryStats": stats,
        "warnings": errors,
        "sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        "items": items,
    }
    print(f"TOTAL: {len(items)} equivalências | ARCA únicos: {arca_unique} | Sabó únicos: {sabo_unique}")
    if args.dry_run:
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp = OUT.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(OUT)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        raise
