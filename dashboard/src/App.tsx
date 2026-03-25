import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage    from './pages/LoginPage'
import Dashboard    from './pages/Dashboard'
import DevicePage   from './pages/DevicePage'

function isTokenValid(): boolean {
  const token = localStorage.getItem('token')
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    // exp is in seconds
    return payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

function PrivateRoute({ children }: { children: JSX.Element }) {
  return isTokenValid() ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/device/:id" element={<PrivateRoute><DevicePage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
