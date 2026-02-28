export const pythonTraceback = `Traceback (most recent call last):
  File "/app/main.py", line 42, in <module>
    result = process_data(data)
  File "/app/processor.py", line 15, in process_data
    return data["key"]["nested"]
KeyError: 'nested'`;

export const pythonImportError = `Traceback (most recent call last):
  File "/app/server.py", line 1, in <module>
    from flask import Flask
ModuleNotFoundError: No module named 'flask'`;

export const pythonTypeError = `Traceback (most recent call last):
  File "/app/calc.py", line 10, in compute
    return x + y
TypeError: unsupported operand type(s) for +: 'int' and 'str'`;

export const pythonValueError = `Traceback (most recent call last):
  File "/app/parser.py", line 25, in parse_int
    return int(value)
ValueError: invalid literal for int() with base 10: 'abc'`;
