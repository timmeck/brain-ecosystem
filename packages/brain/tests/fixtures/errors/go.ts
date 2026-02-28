export const goCompileError = `./main.go:15:2: undefined: fmt.Prinln
./main.go:20:5: cannot use "hello" (untyped string constant) as int value in assignment`;

export const goPanicError = `goroutine 1 [running]:
main.main()
	/app/main.go:12 +0x40
panic: runtime error: index out of range [5] with length 3`;

export const goTypeError = `./handler.go:25:15: cannot convert result (variable of type string) to type int`;
