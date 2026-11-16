import type { ReactNode } from "react";

// One place for error, success and empty messages so they look the same everywhere
function Notice({ kind = "info", children }: { kind?: "error" | "success" | "info"; children: ReactNode }) {
  const style = kind === "error" ? "danger" : kind === "success" ? "success" : "secondary";
  return (
    <div className={`alert alert-${style} py-2 mb-3`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export default Notice;
