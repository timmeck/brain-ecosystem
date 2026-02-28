export const rustCompilerError = `error[E0308]: mismatched types
 --> src/main.rs:10:5
  |
9 | fn get_count() -> u32 {
  |                   --- expected \`u32\` because of return type
10|     "hello"
  |     ^^^^^^^ expected \`u32\`, found \`&str\``;

export const rustBorrowError = `error[E0502]: cannot borrow \`v\` as mutable because it is also borrowed as immutable
 --> src/main.rs:6:5
  |
4 |     let first = &v[0];
  |                  - immutable borrow occurs here
5 |
6 |     v.push(4);
  |     ^^^^^^^^^ mutable borrow occurs here
7 |
8 |     println!("{}", first);
  |                    ----- immutable borrow later used here`;

export const rustLifetimeError = `error[E0106]: missing lifetime specifier
 --> src/lib.rs:5:16
  |
5 | fn longest(x: &str, y: &str) -> &str {
  |               ----     ----     ^ expected named lifetime parameter`;
