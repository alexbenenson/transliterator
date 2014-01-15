Transliterator
==============

Transliterator extension for Firefox allows as-you-type conversion of text from
one alphabet to another. A number of different conversion schemes are supported
out of the box, custom schemes can be defined by the user. See
[project homepage](http://www.benya.com/transliterator/) for more details.

How to build
------------

To create a Transliterator build run `build.py` script in this directory (Python
2.x required). By default the build will be saved as `transliterator.xpi`, a
command line parameter can be provided to use a different file name:

    python build.py fooliterator.xpi

If the command line parameter is `-` the build will be written to stdout.

How to test
-----------

Transliterator builds can be installed automatically into your browser via
[Extension Auto-Installer extension](https://addons.mozilla.org/addon/autoinstaller/).
In order to do that run `autoinstaller.py` script in this directory (Python 2.x
required). By default, it is assumed that xtension Auto-Installer is listening
on port 8888, you can specify a different port as command line parameter:

    python autoinstall.py 7777

You can also specify a `host:port` combination for remote installations:

    python autoinstall.py 192.168.1.2:8888
