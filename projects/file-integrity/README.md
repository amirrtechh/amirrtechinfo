# File Integrity

I made this to learn how file hashes can help spot changes in a Linux lab folder. It saves a SHA-256 baseline, then compares the files with that baseline later.

## Run it

You need Python 3.9 or newer. No extra packages are needed.

~~~sh
python3 file_integrity.py baseline ~/lab --manifest ~/lab-baseline.json
python3 file_integrity.py check ~/lab --manifest ~/lab-baseline.json
~~~

The manifest must be stored outside the directory being checked. The checker reads regular files, skips symbolic links, and reports added, changed, and missing files. A changed file is a clue to investigate, not proof that a system is compromised. Keep the baseline somewhere safe; if someone can change both the files and the manifest, the comparison cannot be trusted.
