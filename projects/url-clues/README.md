# URL Clues

I made this as a small learning tool for spotting things worth checking in a suspicious link. It parses the address locally and never opens the site or makes a network request.

## Run it

You need Python 3.9 or newer. No extra packages are needed.

~~~sh
python3 url_clues.py https://example.com/login
python3 url_clues.py example.com --json
~~~

It points out clues such as plain HTTP, embedded credentials, an IP address used as the host, IDN punycode, unusual ports, and long hostnames. These checks can produce false alarms and can miss dangerous links; they are not a safety verdict. Don't visit a suspicious link just because this tool found no clues.
