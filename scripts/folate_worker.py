#!/usr/bin/env python3
"""Persistent JSON-lines worker for Folate DOM element ranking.

Reads one JSON request per line from stdin:
  {"id": "...", "query": "...", "html": "...", "top_k": 3, "max_candidates": 48}

Writes one JSON response per line to stdout:
  {"id": "...", "ok": true, "selector": "...", "score": 0.95, "logit": 0.95, "element": "...", "matches": [...]}
or on error:
  {"id": "...", "ok": false, "error": "..."}
"""

import json
import os
import sys

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

_finder = None


def _get_finder():
    global _finder
    if _finder is None:
        from folate import FolateSelectorFinder

        model_dir = os.environ.get("FOLATE_MODEL_DIR") or None
        _finder = FolateSelectorFinder(model_dir=model_dir)
    return _finder


def _handle(req: dict) -> dict:
    req_id = req.get("id")
    action = req.get("action", "resolve")

    if action == "status":
        finder = _get_finder()
        return {
            "id": req_id,
            "ok": True,
            "available": True,
            "providers": getattr(finder, "active_providers", []),
        }

    query = req.get("query")
    html = req.get("html")
    if not isinstance(query, str) or not query.strip():
        return {"id": req_id, "ok": False, "error": "FOLATE_QUERY_REQUIRED"}
    if not isinstance(html, str) or not html.strip():
        return {"id": req_id, "ok": False, "error": "FOLATE_HTML_REQUIRED"}

    top_k = req.get("top_k", 3)
    if not isinstance(top_k, int) or top_k < 1:
        top_k = 3
    top_k = min(top_k, 20)

    max_candidates = req.get("max_candidates", 48)
    if not isinstance(max_candidates, int) or max_candidates < 1:
        max_candidates = 48
    max_candidates = min(max_candidates, 200)

    finder = _get_finder()
    matches = finder.rank(
        query.strip(),
        html,
        top_k=top_k,
        max_candidates=max_candidates,
    )
    top = matches[0] if matches else None
    return {
        "id": req_id,
        "ok": True,
        "selector": top["selector"] if top else None,
        "score": top["score"] if top else None,
        "logit": top.get("logit") if top else None,
        "element": top["element"] if top else None,
        "matches": matches,
    }


def main():
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            if isinstance(req, dict):
                req_id = req.get("id")
                resp = _handle(req)
            else:
                resp = {"id": None, "ok": False, "error": "INVALID_REQUEST"}
        except Exception as exc:
            resp = {"id": req_id, "ok": False, "error": str(exc) or "FOLATE_WORKER_ERROR"}
        sys.stdout.write(json.dumps(resp) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
