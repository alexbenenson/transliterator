#!/usr/bin/env python

import sys, os, StringIO, urllib

"""
  This script installs an extension build automatically, via Extension
  Auto-Installer extension. A command line parameter can specify the port
  number on which Extension Auto-Installer is listening (8888 by default)
  or a host:port combination for remote installations.
"""

def autoinstall(path, destination):
  sys.path.insert(0, basedir)
  import build

  output = StringIO.StringIO()
  build.build(path, output)

  if ":" in destination:
    host, port = destination.split(":", 1)
  else:
    host, port = "localhost", destination
  urllib.urlopen('http://%s:%s/' % (host, port), data=output.getvalue())

if __name__ == "__main__":
  basedir = os.path.dirname(sys.argv[0])
  if basedir == "":
    basedir = "."

  destination = sys.argv[1] if len(sys.argv) >= 2 else "8888"
  autoinstall(basedir, destination)
