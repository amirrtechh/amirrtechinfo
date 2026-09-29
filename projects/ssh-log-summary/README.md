# SSH Log Summary

I made this while learning how Linux records SSH login attempts. It reads a local OpenSSH auth log and summarizes common failed and successful login events by IP address and username.

## Run it

You need Python 3.9 or newer. There are no extra packages to install.

~~~sh
python3 ssh_log_summary.py /var/log/auth.log
~~~

On some Linux systems the file is named /var/log/secure. You can change how many entries appear in each list or print JSON:

~~~sh
python3 ssh_log_summary.py /var/log/secure --top 10
python3 ssh_log_summary.py /path/to/auth.log --json
~~~

The script reads the file you pass in and prints a summary. It does not change the log, contact the network, or detect every possible SSH log format. The usernames and IP addresses in a report can be sensitive, so take care before sharing the output.
