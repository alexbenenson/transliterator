#!/usr/bin/env python

import sys, os, subprocess, zipfile

"""
  This script creates an extension build. Without a command line parameter
  the file will be saved as transliterator.xpi, otherwise the command line
  parameter determines the output file name. The command line parameter can
  be -, the build will be written to stdout then.
"""

def is_ignored(path):
  return (
    path.startswith(".") or
    path == "LICENSE" or
    os.path.splitext(path)[1] in (".md", ".py", ".pyc", ".xpi")
  )

def add(archive, path, relpath=""):
  if is_ignored(relpath):
    return

  if os.path.isfile(path):
    archive.write(path, relpath)
  elif os.path.isdir(path):
    if relpath != "":
      relpath += "/"
    for name in os.listdir(path):
      add(archive, os.path.join(path, name), relpath + name)

def build(dir, output):
  with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    add(archive, dir)

if __name__ == "__main__":
  basedir = os.path.dirname(sys.argv[0])
  if basedir == "":
    basedir = "."

  output = sys.argv[1] if len(sys.argv) >= 2 else "transliterator.xpi"
  if output == "-":
    output = sys.stdout

  build(basedir, output)
