#!/usr/bin/env python3
"""
SVG Editor Server

Serves the svg_editor tool and handles SVG save operations.

Usage:
    python server.py [--port PORT] [--svg-folder PATH]
    
Example:
    python server.py --port 3456 --svg-folder /path/to/svgs
"""
import sys
import logging
import argparse
import os

# Force all output to be unbuffered
sys.stdout = sys.stderr

# Set up logging to stderr
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import shutil
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set defaults at module level (uvicorn reimports the module)
TOOL_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(TOOL_DIR))
SVG_FOLDER = os.path.join(PROJECT_ROOT, "materials/raw")

@app.post("/save-svg")
async def save_svg(request: Request):
    logger.info("POST /save-svg received")
    try:
        data = await request.json()
        logger.info(f"JSON parsed, keys: {list(data.keys())}")
        filename = data["filename"]
        content = data["content"]
        # Optional: specify subfolder within SVG_FOLDER
        subfolder = data.get("subfolder", "")
        
        logger.info(f"Filename: {filename}, content size: {len(content)}")
        
        target_dir = os.path.join(SVG_FOLDER, subfolder) if subfolder else SVG_FOLDER
        filepath = os.path.join(target_dir, filename)
        backup_path = filepath + ".bak"
        
        # Backup original first
        if os.path.exists(filepath) and not os.path.exists(backup_path):
            shutil.copy2(filepath, backup_path)
            logger.info(f"Backup created: {backup_path}")
        
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        
        logger.info(f"Saved: {filepath}")
        return {"ok": True, "path": filepath}
    except Exception as e:
        import traceback
        logger.error(f"Error: {e}")
        logger.error(traceback.format_exc())
        return JSONResponse({"ok": False, "error": str(e)}, status_code=500)

@app.get("/{path:path}")
async def serve_static(path: str):
    # Root serves project index, /editor serves the tool
    if not path or path == "/":
        filepath = os.path.join(PROJECT_ROOT, "index.html")
        return FileResponse(filepath) if os.path.exists(filepath) else JSONResponse({"error": "Not found", "path": filepath}, status_code=404)
    
    if path == "editor" or path == "editor/":
        filepath = os.path.join(TOOL_DIR, "index.html")
        return FileResponse(filepath) if os.path.exists(filepath) else JSONResponse({"error": "Not found"}, status_code=404)
    
    # First try relative to this tool's directory
    filepath = os.path.join(TOOL_DIR, path)
    
    # If not found, try relative to project root
    if not os.path.exists(filepath):
        filepath = os.path.join(PROJECT_ROOT, path)
    
    # If it's a directory, serve index.html from it
    if os.path.isdir(filepath):
        filepath = os.path.join(filepath, "index.html")
    
    if not os.path.exists(filepath):
        return JSONResponse({"error": "Not found", "tried": filepath}, status_code=404)
    
    return FileResponse(filepath)

def main():
    global SVG_FOLDER, PROJECT_ROOT
    
    parser = argparse.ArgumentParser(description="SVG Editor Server")
    parser.add_argument("--port", type=int, default=3456, help="Port to listen on")
    parser.add_argument("--svg-folder", type=str, help="Folder containing SVG files")
    parser.add_argument("--project-root", type=str, help="Project root for serving static files")
    args = parser.parse_args()
    
    # Default project root is two levels up from this file (tools/svg_editor -> project root)
    tool_dir = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT = args.project_root or os.path.dirname(os.path.dirname(tool_dir))
    
    # Default SVG folder
    SVG_FOLDER = args.svg_folder or os.path.join(PROJECT_ROOT, "materials/raw")
    
    logger.info(f"Project root: {PROJECT_ROOT}")
    logger.info(f"SVG folder: {SVG_FOLDER}")
    logger.info(f"Starting server on port {args.port}")
    
    uvicorn.run(app, host="0.0.0.0", port=args.port)

if __name__ == "__main__":
    main()
