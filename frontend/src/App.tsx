import Navbar from './components/Navbar'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import LandingView from './pages/LandingView'
import DashboardView from './pages/DashboardView'
import ProjectView, { projectLoader } from './pages/ProjectView'
import SignUpView from './pages/SignUpView'
function App() {

  return (
    <>
      <Navbar/>
      <BrowserRouter>
        <Routes>
          <Route
            path='/'
            element={<LandingView/>}
          />
          <Route
            path='/dashboard'
            element={<DashboardView/>}
          />
          <Route
            path='/project/:id'
            loader={projectLoader}
            element={<ProjectView/>}
          />
          <Route
            path='/sign-up'
            element={<SignUpView/>}
            />
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App
