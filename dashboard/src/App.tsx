import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage    from './pages/LoginPage'
import Dashboard    from './pages/Dashboard'
import DevicePage   from './pages/DevicePage'

const token = () => localStorage.getItem('token')

function PrivateRoute({ children }: { children: JSX.Element }) {
  return token() ? children : <Navigate to="/login" replace />
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
