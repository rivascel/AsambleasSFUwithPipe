export default function Card({ children, className = "" }) {
  // Aquí centralizamos el estilo base
  const baseStyle = "bg-white p-6 rounded-xl shadow-lg border border-gray-200";
  
  return (
    <div className={`${baseStyle} ${className}`}>
      {children}
    </div>
  );
}