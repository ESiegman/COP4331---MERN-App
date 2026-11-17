// The web-only animated icon imports a CSS module; this tells TypeScript what that import is
declare module "*.module.css" {
  const classes: { readonly [name: string]: string };
  export default classes;
}
