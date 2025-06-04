import Navbar from './components/Navbar'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LandingView from './pages/LandingView'
import DashboardView from './pages/DashboardView'
import AppView from './pages/AppView'
import SignUpView from './pages/SignUpView'
import CreateAppView from './pages/CreateAppView';
import UserProvider, { UserContext } from './components/UserProvider'
import { Toaster } from './components/ui/sonner'
import { useContext } from 'react'
function App() {

  return (
    <>
      <UserProvider>
        <Navbar />
        <Routes>
          <Route
            path='/' 
            element={<LandingView />}
          />
          <Route
            path='/dashboard'
            element={
              <DashboardView />
            }
          />
          <Route
            path='/app/:id'
            element={
              <RequireAuth redirectTo='/sign-up'>
              <AppView />
              </RequireAuth>
            }
          />
          <Route
            path='/sign-up'
            element={<SignUpView />}
          />
          <Route
            path='/create-app'
            element={
              <CreateAppView />
            }
          />
        </Routes>
      </UserProvider>
      <Toaster />
    </>
  )
}

function RequireAuth({ children, redirectTo }: { children: React.ReactNode, redirectTo: string }) {
  const { user } = useContext(UserContext);
  return user ? children : <Navigate to={redirectTo} />
}
export default App;
