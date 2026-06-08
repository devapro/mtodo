import { Navbar, Container, Nav, Button, Badge } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function NavBar() {
  const { user, signout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const handleSignout = () => {
    signout();
    navigate('/login');
  };

  return (
    <Navbar expand="md" className="border-bottom mb-4" bg="body-tertiary">
      <Container>
        <Navbar.Brand as={Link} to="/" className="brand-gradient fs-4">
          mTodo
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="main-nav" />
        <Navbar.Collapse id="main-nav">
          <Nav className="me-auto">
            <Nav.Link as={Link} to="/">
              Tasks
            </Nav.Link>
            {user?.role === 'admin' && (
              <Nav.Link as={Link} to="/admin">
                Admin
              </Nav.Link>
            )}
          </Nav>
          <div className="d-flex align-items-center gap-3">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={toggle}
              title="Toggle theme"
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </Button>
            <span className="text-secondary small d-none d-sm-inline">
              {user?.email}
              {user?.role === 'admin' && (
                <Badge bg="primary" className="ms-2">
                  admin
                </Badge>
              )}
            </span>
            <Button variant="outline-danger" size="sm" onClick={handleSignout}>
              Sign out
            </Button>
          </div>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}
