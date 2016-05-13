node-webnfc
===========
This Node.js module provides an implementation of the the
[W3C Web NFC API](https://w3c.github.io/web-nfc/), using
[neard](http://git.kernel.org/cgit/network/nfc/neard.git) as backend.
Other backends may also be supported in the future.

As the Web NFC specification is targeted browsers (UAs, in spec language),
there are a few ways this implementation differs from the spec.

- It does *not* require a secure context
- It currently doesn't use the Web NFC record due to a limitation with ```neard```
  - This means that it does not write origins to Web NFC record
- It uses only one push slot (either for tags, or peers, or both).

Examples and testing
--------------------
Use ```test/tests.js``` as a playground for testing.
Also refer to the [testing guidelines](./test/howto.md).

Known issues
------------
- Writing tags fails with ```neard``` reporting ```"not enough space on tag"```.
- Multiple record tags are not working with the current version of ```neard```.
- External Type tags are not working with the current version of ```neard```.
