import base64
import errno
import fcntl
import json
import os
import pty
import selectors
import signal
import struct
import sys
import termios
import tty


def emit(event):
    sys.stdout.write(json.dumps(event, separators=(",", ":")) + "\n")
    sys.stdout.flush()


ssh_args = json.loads(sys.argv[1])
columns = int(sys.argv[2])
rows = int(sys.argv[3])
child_pid, master_fd = pty.fork()

if child_pid == 0:
    try:
        os.environ["TERM"] = "xterm-256color"
        os.execvp("ssh", ["ssh", *ssh_args])
    except BaseException as error:
        os.write(2, ("Could not execute ssh: " + str(error) + "\r\n").encode())
        os._exit(127)

fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
tty.setraw(master_fd, termios.TCSANOW)
selector = selectors.PollSelector()
stdin_fd = sys.stdin.fileno()
selector.register(master_fd, selectors.EVENT_READ, "terminal")
selector.register(stdin_fd, selectors.EVENT_READ, "control")
emit({"type": "started"})
exit_code = None
control_buffer = b""


def stop_child(_signum, _frame):
    try:
        os.kill(child_pid, signal.SIGTERM)
    except ProcessLookupError:
        pass


signal.signal(signal.SIGTERM, stop_child)
signal.signal(signal.SIGINT, stop_child)

while True:
    for key, _ in selector.select(timeout=0.2):
        if key.data == "terminal":
            try:
                data = os.read(master_fd, 65536)
            except OSError as error:
                if error.errno == errno.EIO:
                    data = b""
                else:
                    raise
            if not data:
                selector.unregister(master_fd)
                break
            emit({"type": "data", "data": base64.b64encode(data).decode("ascii")})
        else:
            chunk = os.read(stdin_fd, 65536)
            if not chunk:
                stop_child(None, None)
                selector.unregister(stdin_fd)
                continue
            control_buffer += chunk
            while b"\n" in control_buffer:
                line, control_buffer = control_buffer.split(b"\n", 1)
                try:
                    event = json.loads(line)
                    if event.get("type") == "input":
                        payload = event.get("data", "").encode("utf-8")
                        while payload:
                            written = os.write(master_fd, payload)
                            payload = payload[written:]
                    elif event.get("type") == "resize":
                        columns = max(20, min(300, int(event.get("cols", columns))))
                        rows = max(5, min(120, int(event.get("rows", rows))))
                        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
                    elif event.get("type") == "stop":
                        stop_child(None, None)
                except (ValueError, TypeError, OSError):
                    pass
    waited_pid, status = os.waitpid(child_pid, os.WNOHANG)
    if waited_pid:
        while True:
            try:
                remaining = os.read(master_fd, 65536)
            except OSError:
                break
            if not remaining:
                break
            emit({"type": "data", "data": base64.b64encode(remaining).decode("ascii")})
        if os.WIFEXITED(status):
            exit_code = os.WEXITSTATUS(status)
        elif os.WIFSIGNALED(status):
            exit_code = 128 + os.WTERMSIG(status)
        break

try:
    selector.close()
    os.close(master_fd)
except OSError:
    pass
emit({"type": "exit", "code": exit_code if exit_code is not None else 1})
