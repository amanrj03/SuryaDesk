export function Brand({ full = true, className = '' }) {
  return full ? (
    <div className={`brand flex items-center ${className}`}>
      <img
        src="/fulllogo.png"
        alt="SuryaDesk"
        width="866"
        height="288"
        className="h-9 w-auto max-w-[190px] object-contain sm:h-10"
      />
    </div>
  ) : (
    <div className={`brand flex items-center ${className}`}>
      <img
        src="/logo.png"
        alt="SuryaDesk"
        width="222"
        height="195"
        className="h-8 w-auto object-contain sm:h-9"
      />
    </div>
  )
}
