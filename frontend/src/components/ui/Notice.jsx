export function Notice({ children }) {
  return children && <p className="notice" role="alert">{children}</p>
}
