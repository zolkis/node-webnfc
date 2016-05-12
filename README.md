node-webnfc
===========
Implements the [W3C Web NFC API](https://w3c.github.io/web-nfc/) for Node.js.
Uses [neard](http://git.kernel.org/cgit/network/nfc/neard.git) as NFC backend, but other backends may also be supported in the future.

As this is not a browser implementation, but a Node.js module, only the API is implemented, there are the following differences from the specification:
- does not require secure context
- does not use Web NFC record (because of a current limitation with neard)
- therefore it does not write origins to Web NFC record
- uses only one push slot (either for tags, or peers, or both).

Examples and testing
--------------------
Use ```test/tests/js``` as a playground for testing.
Also refer to the [testing guidelines](./test/howto.md).

Known issues
------------
- Writing tags fails with neard reporting "not enough space on tag".
- Multiple record tags are not working the current version of ```neard```.
- External Type tags are not working the current version of ```neard```.
