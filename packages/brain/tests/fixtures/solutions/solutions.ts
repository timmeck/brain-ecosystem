export const solutionFixtures = [
  {
    description: 'Add null check before accessing .map() on potentially undefined array',
    commands: '',
    codeChange: 'const items = data?.items ?? [];\nconst mapped = items.map(fn);',
  },
  {
    description: 'Install missing module with npm install',
    commands: 'npm install flask',
    codeChange: '',
  },
  {
    description: 'Fix type mismatch by converting string to number',
    commands: '',
    codeChange: 'return parseInt(value, 10);',
  },
  {
    description: 'Add missing lifetime annotation to function signature',
    commands: '',
    codeChange: "fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {",
  },
  {
    description: 'Grant execute permission to script',
    commands: 'chmod +x deploy.sh',
    codeChange: '',
  },
];
