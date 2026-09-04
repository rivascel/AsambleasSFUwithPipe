// Crea un componente ProtectedRoute
import AppContext from '../context/AppContext';


import API_URL from '../config/api';

const apiUrl = API_URL;

const ProtectedRoute = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();
  // const { apiUrl } = useContext(AppContext);

  useEffect(() => {
    const verifyAuth = async () => {
      try {
        await axios.get(`${apiUrl}/api/owner-data`, {
          withCredentials: true
        });
        setIsAuthenticated(true);
      } catch (error) {
        navigate("/");
      }
    };
    verifyAuth();
  }, [navigate]);

  return isAuthenticated ? children : null;
};

export default ProtectedRoute;