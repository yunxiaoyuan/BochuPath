export interface RuntimeLocation {
  hostname: string;
  pathname: string;
}

export function isPageDropRuntime(
  location: RuntimeLocation = window.location,
): boolean {
  const isPageDropHost = /(^|\.)pagedrop\.(?:fscut\.com|ai|io)$/.test(
    location.hostname,
  );
  const isPageDropFilePage =
    location.pathname.includes("/api/link/") &&
    location.pathname.endsWith("/index.html");
  return isPageDropHost || isPageDropFilePage;
}

export function usesSharedJsonRepository(
  location: RuntimeLocation = window.location,
): boolean {
  return (
    isPageDropRuntime(location) ||
    (import.meta.env.DEV &&
      import.meta.env.MODE !== "test" &&
      import.meta.env.VITE_BOCHUPATH_SHARED_LOCAL !== "false")
  );
}
