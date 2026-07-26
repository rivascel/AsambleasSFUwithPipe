export default function Title({ children, className = ""}) {

    const baseStyle = "text-lg font-semibold mb-4 text-teal-600"


    return (
        <h2 className={`${baseStyle}`}>
            {children}
        </h2>
    )


}