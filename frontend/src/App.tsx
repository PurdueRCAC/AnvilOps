import Navbar from './components/Navbar'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LandingView from './pages/LandingView'
import DashboardView from './pages/DashboardView'
import ProjectView from './pages/ProjectView'
import SignUpView from './pages/SignUpView'
import CreateProjectView from './pages/CreateProjectView'
import UserProvider, { UserContext } from './components/UserProvider'
import { Toaster } from './components/ui/sonner'
import { useContext } from 'react'
function App() {

  return (
    <>
    <UserProvider>
      <Navbar/>
        <Routes>
          <Route
            path='/'
            element={<LandingView/>}
          />
          <Route
            path='/dashboard'
            element={
              <RequireAuth redirectTo='/sign-up'>
                <DashboardView/>
              </RequireAuth>
            }
          />
          <Route
            path='/project/:id'
            element={
            <RequireAuth redirectTo='sign-up'>
              <ProjectView/>
            </RequireAuth>
            }
          />
          <Route
            path='/sign-up'
            element={<SignUpView/>}
            />
          <Route
            path='/create-project'
            element={
              <RequireAuth redirectTo='sign-up'>
              <CreateProjectView/>
            </RequireAuth>
            }
            />
        </Routes>
      </UserProvider>
      <Toaster/>
    </>
  )
}

function RequireAuth({ children, redirectTo } : { children: React.ReactNode, redirectTo: string}) {
  const { user } = useContext(UserContext);
  return user ? children : <Navigate to={redirectTo}/>
}
export default App;
