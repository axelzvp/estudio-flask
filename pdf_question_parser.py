"""Parser de preguntas de opcion multiple desde PDF o imagen.

Este modulo esta pensado para integrarse en Flask (por ejemplo con request.files),
pero puede usarse de forma standalone con rutas de archivo.

Dependencias:
- pdfplumber (extraccion de texto digital)
- pdf2image + pytesseract (OCR para PDF escaneado / imagen)

Nota: pdf2image requiere Poppler instalado en el sistema.
"""

from __future__ import annotations

import os
import re
import tempfile
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import pdfplumber
import pytesseract
from pdf2image import convert_from_path
from PIL import Image


# Inicio de pregunta: 4) 25) 12. 7.
QUESTION_START_RE = re.compile(r"^\s*\d{1,4}[\)\.]\s+")
# Opcion valida estricta: A) a) B) b) C) c) D) d)
OPTION_START_RE = re.compile(r"^\s*([A-Da-d])\)\s*(.*)$")
# Para limpiar numeracion inicial
QUESTION_PREFIX_CLEAN_RE = re.compile(r"^\s*\d{1,4}[\)\.]\s*")
EXPLICIT_ANSWER_RE = re.compile(r"(respuesta|correcta)\s*[:\-]\s*([A-Da-d])", re.IGNORECASE)
OPTION_CORRECT_INLINE_RE = re.compile(
    r"(\(correcta\)|\[correcta\]|\bcorrecta\b|\bcorrecto\b|\bresp(?:uesta)?\b)",
    re.IGNORECASE,
)
OPTION_CORRECT_PREFIX_RE = re.compile(r"^\s*(\*|->|=>|✓|✔|☑|✅)\s*")
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}
TEXT_EXTENSIONS = {".txt", ".md", ".csv"}
RED_START = "[[RED]]"
RED_END = "[[/RED]]"


class PDFQuestionParserError(Exception):
    """Error controlado del parser de preguntas."""


@dataclass
class ParseConfig:
    """Configuracion de parseo."""

    ocr_lang: str = "spa+eng"
    ocr_dpi: int = 300
    # Si texto digital de una pagina tiene menos que esto, intentamos OCR.
    min_digital_chars: int = 35
    # Seguridad: evita resultados basura por preguntas vacias.
    min_question_chars: int = 5
    # OCR puede traer lineas vacias extras; este limite limpia ruido.
    collapse_blank_lines: bool = True
    # Si True, solo acepta preguntas cuyo numero inicial se detecta en rojo.
    require_red_question_number: bool = False


def parse_questions_from_file(
    file_source: Union[str, Any],
    config: Optional[ParseConfig] = None,
) -> List[Dict[str, Any]]:
    """Funcion principal.

    Acepta:
    - Ruta local (str)
    - Archivo tipo Flask FileStorage (objeto con .save y .filename)

    Devuelve:
    [
      {
        "pregunta": "...",
        "opciones": ["A) ...", "B) ..."]
      }
    ]
    """
    cfg = config or ParseConfig()
    local_path, should_remove = _materialize_input(file_source)

    try:
        ext = os.path.splitext(local_path)[1].lower()
        if ext == ".pdf":
            full_text = extract_text_from_pdf(local_path, cfg)
        elif ext in IMAGE_EXTENSIONS:
            full_text = extract_text_from_image(local_path, cfg)
        elif ext in TEXT_EXTENSIONS:
            full_text = extract_text_from_plain_text_file(local_path, cfg)
        else:
            raise PDFQuestionParserError(
                f"Formato no soportado: {ext}. Usa PDF, imagen o texto (.txt/.md/.csv)."
            )
        return parse_questions_from_text(full_text, cfg)
    finally:
        if should_remove:
            try:
                os.remove(local_path)
            except OSError:
                pass


def extract_text_from_pdf(pdf_path: str, config: ParseConfig) -> str:
    """Extrae texto de PDF pagina por pagina.

    Estrategia:
    1) Intentar texto digital con pdfplumber.
    2) Si la pagina no tiene texto suficiente, usar OCR solo en esa pagina.
    """
    page_texts: List[str] = []

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for idx, page in enumerate(pdf.pages):
                digital = (page.extract_text() or "").strip()
                if len(_normalize_spaces(digital)) >= config.min_digital_chars:
                    page_texts.append(_extract_text_with_color_marks_from_pdf_page(page))
                    continue

                ocr_text = _ocr_pdf_page(
                    pdf_path=pdf_path,
                    page_number=idx + 1,
                    lang=config.ocr_lang,
                    dpi=config.ocr_dpi,
                )
                page_texts.append(ocr_text.strip())
    except Exception as exc:
        raise PDFQuestionParserError(f"No se pudo procesar el PDF: {exc}") from exc

    return _join_pages_text(page_texts, collapse_blank_lines=config.collapse_blank_lines)


def extract_text_from_image(image_path: str, config: ParseConfig) -> str:
    """Extrae texto con OCR desde una imagen."""
    try:
        with Image.open(image_path) as image:
            text = _ocr_image_with_color_markers(image, lang=config.ocr_lang)
    except Exception as exc:
        raise PDFQuestionParserError(f"No se pudo hacer OCR de la imagen: {exc}") from exc
    return _normalize_multiline(text, collapse_blank_lines=config.collapse_blank_lines)


def extract_text_from_plain_text_file(text_path: str, config: ParseConfig) -> str:
    """Lee archivo de texto plano con fallback de codificacion."""
    for enc in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            with open(text_path, "r", encoding=enc) as f:
                content = f.read()
            return _normalize_multiline(content, collapse_blank_lines=config.collapse_blank_lines)
        except UnicodeDecodeError:
            continue
        except Exception as exc:
            raise PDFQuestionParserError(f"No se pudo leer el archivo de texto: {exc}") from exc
    raise PDFQuestionParserError("No se pudo decodificar el archivo de texto (UTF-8/Latin-1).")


def parse_questions_from_text(text: str, config: Optional[ParseConfig] = None) -> List[Dict[str, Any]]:
    """Detecta y valida preguntas de opcion multiple desde texto crudo.

    Algoritmo:
    - Lee linea a linea.
    - Inicio por numeracion detectada.
    - Cierra bloque al encontrar nueva numeracion.
    - Valida bloque: al menos 2 opciones.
    - Elimina numeracion inicial.
    """
    cfg = config or ParseConfig()
    if not text or not text.strip():
        return []

    prepared = _prepare_text_for_parsing(
        _normalize_multiline(text, collapse_blank_lines=cfg.collapse_blank_lines)
    )
    lines = prepared.splitlines()
    red_marked_starts = sum(
        1
        for ln in lines
        if _line_has_red_question_prefix(ln)
    )
    enforce_red = bool(cfg.require_red_question_number and red_marked_starts > 0)

    raw_blocks: List[List[str]] = []
    current_block: List[str] = []

    for raw_line in lines:
        line = raw_line.rstrip()
        line_clean = _remove_color_markers(line)
        if QUESTION_START_RE.match(line_clean):
            if enforce_red and not _line_has_red_question_prefix(line):
                continue
            if current_block:
                raw_blocks.append(current_block)
            current_block = [line_clean]
            continue

        if current_block:
            current_block.append(line)

    if current_block:
        raw_blocks.append(current_block)

    parsed: List[Dict[str, Any]] = []
    for block in raw_blocks:
        item = _parse_and_validate_block(block, cfg)
        if item is not None:
            parsed.append(item)

    return parsed


def _parse_and_validate_block(
    block_lines: Sequence[str],
    config: ParseConfig,
) -> Optional[Dict[str, Any]]:
    """Convierte un bloque en pregunta estructurada.

    Reglas:
    - Debe tener texto de pregunta
    - Debe tener al menos 2 opciones
    - Si hay dudas fuertes (vacios / ruido), se descarta
    """
    cleaned_lines = [ln.strip() for ln in block_lines if ln.strip()]
    if not cleaned_lines:
        return None

    first_line = QUESTION_PREFIX_CLEAN_RE.sub("", cleaned_lines[0]).strip()
    remainder = cleaned_lines[1:]

    question_parts: List[str] = [first_line] if first_line else []
    options: List[str] = []
    option_has_marker: List[bool] = []
    current_option_idx: Optional[int] = None
    explicit_answer_idx: Optional[int] = None

    for line in remainder:
        clean_line = _remove_color_markers(line)
        answer_match = EXPLICIT_ANSWER_RE.search(clean_line)
        if answer_match:
            explicit_answer_idx = _label_to_option_index(answer_match.group(2))

        option_match = OPTION_START_RE.match(clean_line)
        if option_match:
            raw_label = option_match.group(1)
            label = _normalize_option_label(raw_label)
            body = option_match.group(2).strip()
            options.append(f"{label}) {body}".strip())
            option_has_marker.append(_option_has_correct_marker(line, body))
            current_option_idx = len(options) - 1
            continue

        if current_option_idx is not None:
            options[current_option_idx] = _remove_color_markers(
                f"{options[current_option_idx]} {clean_line}".strip()
            )
            if _option_has_correct_marker(line, clean_line):
                option_has_marker[current_option_idx] = True
        else:
            question_parts.append(clean_line)

    question_text = _normalize_spaces(" ".join(part for part in question_parts if part))
    normalized_options = [_normalize_spaces(op) for op in options if _normalize_spaces(op)]

    if len(question_text) < config.min_question_chars:
        return None
    if len(normalized_options) < 2:
        return None

    detected_correct: Optional[int] = None
    if explicit_answer_idx is not None and 0 <= explicit_answer_idx < len(normalized_options):
        detected_correct = explicit_answer_idx
    else:
        marked = [idx for idx, flag in enumerate(option_has_marker) if flag]
        if len(marked) == 1 and marked[0] < len(normalized_options):
            detected_correct = marked[0]

    return {
        "pregunta": question_text,
        "opciones": normalized_options,
        "correct_option": detected_correct,
    }


def _normalize_option_label(label: str) -> str:
    token = (label or "").strip().upper()
    if token in {"A", "B", "C", "D"}:
        return token
    return "A"


def _prepare_text_for_parsing(text: str) -> str:
    """Normaliza texto OCR para mejorar segmentación de preguntas/opciones.

    Casos que corrige:
    - Varias preguntas en la misma línea.
    - Opciones embebidas en la misma línea (A) ... B) ... C) ...).
    - Espacios raros alrededor de numeración o etiquetas.
    """
    if not text:
        return ""

    out_lines: List[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            out_lines.append("")
            continue

        # Unificar guiones largos y puntos medios comunes en OCR.
        line = line.replace("—", "-").replace("–", "-")

        # Separa inicios de pregunta embebidos en una sola linea.
        # Tolera marcador RED alrededor del token numerico.
        line = re.sub(
            r"(?<!^)\s+((?:\[\[RED\]\])*\d{1,4}[\)\.](?:\[\[/RED\]\])*\s+)",
            r"\n\1",
            line,
        )

        # Separa opciones embebidas en la misma linea.
        # Ej: "A) ... B) ... C) ...", incluso con marcador RED.
        line = re.sub(
            r"(?<!^)\s+((?:\[\[RED\]\])*[A-Da-d]\)(?:\[\[/RED\]\])*\s+)",
            r"\n\1",
            line,
        )

        out_lines.extend(part.strip() for part in line.split("\n") if part.strip())

    return "\n".join(out_lines)


def _ocr_pdf_page(pdf_path: str, page_number: int, lang: str, dpi: int) -> str:
    images = convert_from_path(
        pdf_path,
        dpi=dpi,
        first_page=page_number,
        last_page=page_number,
        fmt="png",
    )
    if not images:
        return ""
    return _ocr_image_with_color_markers(images[0], lang=lang)


def _extract_text_with_color_marks_from_pdf_page(page: Any) -> str:
    """Reconstruye texto de PDF digital y marca solo palabras en rojo (si aplica)."""
    try:
        words = page.extract_words(use_text_flow=True, x_tolerance=2, y_tolerance=3)
    except Exception:
        words = []
    if not words:
        return (page.extract_text() or "").strip()

    red_char_boxes = _collect_colored_char_boxes(page, target="red")

    normalized_words: List[Dict[str, Any]] = []
    for w in words:
        text = str(w.get("text") or "").strip()
        if not text:
            continue
        box = _safe_box(w)
        red_marked = _is_word_in_color_boxes(box, red_char_boxes)
        if red_marked:
            text = f"{RED_START}{text}{RED_END}"
        normalized_words.append({
            "text": text,
            "x0": box[0],
            "top": box[1],
        })

    normalized_words.sort(key=lambda x: (x["top"], x["x0"]))
    lines: List[List[str]] = []
    tops: List[float] = []
    tol = 3.0
    for word in normalized_words:
        if not lines:
            lines.append([word["text"]])
            tops.append(word["top"])
            continue
        if abs(word["top"] - tops[-1]) <= tol:
            lines[-1].append(word["text"])
        else:
            lines.append([word["text"]])
            tops.append(word["top"])
    return "\n".join(" ".join(parts) for parts in lines).strip()


def _collect_colored_char_boxes(page: Any, target: str) -> List[Tuple[float, float, float, float]]:
    boxes: List[Tuple[float, float, float, float]] = []
    for ch in getattr(page, "chars", []) or []:
        color = _normalize_pdf_color(ch.get("non_stroking_color"))
        if not color:
            continue
        if target == "red" and _is_red_rgb(color):
            boxes.append(_safe_box(ch))
    return boxes


def _safe_box(obj: Dict[str, Any]) -> Tuple[float, float, float, float]:
    x0 = float(obj.get("x0", 0) or 0)
    x1 = float(obj.get("x1", 0) or 0)
    top = float(obj.get("top", 0) or 0)
    bottom = float(obj.get("bottom", 0) or 0)
    if x1 < x0:
        x0, x1 = x1, x0
    if bottom < top:
        top, bottom = bottom, top
    return x0, top, x1, bottom


def _normalize_pdf_color(color: Any) -> Optional[Tuple[int, int, int]]:
    if color is None:
        return None
    if isinstance(color, (list, tuple)):
        vals = list(color)
    elif isinstance(color, (int, float)):
        vals = [color, color, color]
    else:
        return None
    if len(vals) == 1:
        vals = [vals[0], vals[0], vals[0]]
    if len(vals) < 3:
        return None
    rgb: List[int] = []
    for v in vals[:3]:
        if isinstance(v, float) and 0.0 <= v <= 1.0:
            rgb.append(int(round(v * 255)))
        else:
            try:
                iv = int(round(float(v)))
            except Exception:
                return None
            rgb.append(max(0, min(255, iv)))
    return rgb[0], rgb[1], rgb[2]


def _is_red_rgb(rgb: Tuple[int, int, int]) -> bool:
    r, g, b = rgb
    return r >= 140 and g <= 120 and b <= 120 and r >= g + 35 and r >= b + 35


def _is_word_in_color_boxes(
    word_box: Tuple[float, float, float, float],
    color_boxes: Sequence[Tuple[float, float, float, float]],
) -> bool:
    wx0, wy0, wx1, wy1 = word_box
    word_area = max(1.0, (wx1 - wx0) * (wy1 - wy0))
    for rx0, ry0, rx1, ry1 in color_boxes:
        ix0 = max(wx0, rx0)
        iy0 = max(wy0, ry0)
        ix1 = min(wx1, rx1)
        iy1 = min(wy1, ry1)
        if ix1 <= ix0 or iy1 <= iy0:
            continue
        overlap = (ix1 - ix0) * (iy1 - iy0)
        if overlap / word_area >= 0.35:
            return True
    return False


def _ocr_image_with_color_markers(image: Image.Image, lang: str) -> str:
    """OCR por palabra y marca solo tokens en rojo (si aplica)."""
    data = pytesseract.image_to_data(image, lang=lang, output_type=pytesseract.Output.DICT)
    line_words: Dict[Tuple[int, int, int], List[Tuple[int, str]]] = {}
    line_order: List[Tuple[int, int, int]] = []

    n = len(data.get("text", []))
    for i in range(n):
        raw_text = str(data["text"][i] or "").strip()
        if not raw_text:
            continue
        left = int(data["left"][i] or 0)
        top = int(data["top"][i] or 0)
        width = int(data["width"][i] or 0)
        height = int(data["height"][i] or 0)
        red_marked = _is_bbox_reddish(image, left, top, width, height)
        text = raw_text
        if red_marked:
            text = f"{RED_START}{text}{RED_END}"

        key = (
            int(data["block_num"][i] or 0),
            int(data["par_num"][i] or 0),
            int(data["line_num"][i] or 0),
        )
        if key not in line_words:
            line_words[key] = []
            line_order.append(key)
        line_words[key].append((left, text))

    output_lines: List[str] = []
    for k in line_order:
        words = sorted(line_words[k], key=lambda item: item[0])
        output_lines.append(" ".join(w for _, w in words))
    return "\n".join(output_lines).strip()


def _is_bbox_reddish(image: Image.Image, left: int, top: int, width: int, height: int) -> bool:
    if width <= 0 or height <= 0:
        return False
    img_w, img_h = image.size
    x0 = max(0, min(img_w, left))
    y0 = max(0, min(img_h, top))
    x1 = max(0, min(img_w, left + width))
    y1 = max(0, min(img_h, top + height))
    if x1 <= x0 or y1 <= y0:
        return False

    crop = image.convert("HSV").crop((x0, y0, x1, y1))
    pixels = list(crop.getdata())
    if not pixels:
        return False

    red_count = 0
    for h, s, v in pixels:
        # OpenCV-like HSV in PIL: H [0..255]
        if ((h <= 12 or h >= 245) and s >= 70 and v >= 70):
            red_count += 1
    return (red_count / len(pixels)) >= 0.20


def _materialize_input(file_source: Union[str, Any]) -> Tuple[str, bool]:
    """Convierte entrada a ruta local.

    Returns:
    (ruta, eliminar_al_final)
    """
    if isinstance(file_source, str):
        if not os.path.exists(file_source):
            raise PDFQuestionParserError(f"Archivo no encontrado: {file_source}")
        return file_source, False

    # Compatible con werkzeug.datastructures.FileStorage
    filename = getattr(file_source, "filename", None)
    save_method = getattr(file_source, "save", None)
    if filename and callable(save_method):
        suffix = os.path.splitext(filename)[1] or ".tmp"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            temp_path = tmp.name
        file_source.save(temp_path)
        return temp_path, True

    raise PDFQuestionParserError(
        "Entrada no valida. Usa ruta de archivo o FileStorage de Flask."
    )


def _join_pages_text(page_texts: Sequence[str], collapse_blank_lines: bool) -> str:
    merged = "\n\n".join(t for t in page_texts if t and t.strip())
    return _normalize_multiline(merged, collapse_blank_lines=collapse_blank_lines)


def _normalize_multiline(text: str, collapse_blank_lines: bool) -> str:
    if not text:
        return ""

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [ln.rstrip() for ln in text.split("\n")]

    if not collapse_blank_lines:
        return "\n".join(lines)

    compact: List[str] = []
    last_blank = False
    for line in lines:
        is_blank = not line.strip()
        if is_blank and last_blank:
            continue
        compact.append(line)
        last_blank = is_blank
    return "\n".join(compact).strip()


def _normalize_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def _remove_color_markers(text: str) -> str:
    if not text:
        return ""
    return (
        text.replace(RED_START, "")
        .replace(RED_END, "")
    )


def _line_has_red_question_prefix(line: str) -> bool:
    if not line:
        return False
    red_stripped = line.strip()
    if RED_START not in red_stripped:
        return False
    clean = _remove_color_markers(red_stripped)
    return bool(QUESTION_START_RE.match(clean))


def _label_to_option_index(label: str) -> Optional[int]:
    token = _normalize_option_label(label)
    mapping = {"A": 0, "B": 1, "C": 2, "D": 3}
    return mapping.get(token)


def _option_has_correct_marker(raw_line: str, option_text: str) -> bool:
    """Detecta señas explícitas de opción correcta (sin usar resaltado por color)."""
    line_clean = _remove_color_markers(raw_line or "")
    text_clean = _remove_color_markers(option_text or "")

    if OPTION_CORRECT_PREFIX_RE.search(line_clean):
        return True
    if OPTION_CORRECT_INLINE_RE.search(line_clean):
        return True
    if OPTION_CORRECT_INLINE_RE.search(text_clean):
        return True
    return False
