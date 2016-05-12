Setup
=====

Build neard from source, or install via package manager.
Nfctool (neard/tools/nfctool) is also deployed.

Starting and stopping neard:
----------------------------
```
$ sudo systemctl stop neard
$ sudo systemctl start neard
$ sudo systemctl status -l neard
```

Manual control of the NFC adapter
----------------------------------
NFC adapter: list, power on, enable polling.
```
$ nfctool -l
$ nfctool -d nfc0 -1
$ nfctool -d nfc0 --poll=Both
```

Using dbus-monitor
------------------
See [https://wiki.ubuntu.com/DebuggingDBus](https://wiki.ubuntu.com/DebuggingDBus).


Sending manual DBUS messages to ```neard``` using d-feet
--------------------------------------------------------

### Writing to a tag
#### org.neard.Tag.Write parameters

Writing URI tag
```
{"Type" : GLib.Variant('s', "URI"), "URI" : GLib.Variant('s', "www.intel.com") }
```

Writing Text tag
```
{"Type" : GLib.Variant('s', "Text"), "Encoding" : GLib.Variant('s', "UTF-8"), "Language" : GLib.Variant('s', "enUS"), "Representation" : GLib.Variant('s', "Hello from neard.") }
```

Note that all properties must be present, otherwise write will fail, like with this:
```
{"Type" : GLib.Variant('s', "Text"), "Representation" : GLib.Variant('s', "Hello from neard.") }
```

Writing multiple tags (does not work):
```
[{"Type" : GLib.Variant('s', "URI"), "URI" : GLib.Variant('s', "www.intel.com") } {"Type" : GLib.Variant('s', "Text"), "Encoding" : GLib.Variant('s', "UTF-8"), "Language" : GLib.Variant('s', "enUS"), "Representation" : GLib.Variant('s', "Hello xfrom neard.") }]
```

Write media tag (does not work):
```
{"Type" : GLib.Variant('s', "MIME"), "MIME" : GLib.Variant('s', "text/plain"), "Representation" : GLib.Variant('s', "Hello xfrom neard.")   }
```
