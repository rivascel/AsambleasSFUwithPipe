export default function Button({ children, className = "", variant = "primary", ...props }) {
  // Define variantes de estilo
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300"
  };

  const baseStyle = "font-semibold py-2 px-4 rounded-lg transition duration-200";

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}