import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/cairo'
import './index.css'
import './styles/design-system.css'
import './styles/app-ui.css'
import App from './App.tsx'
import { ThemeProvider } from './context/ThemeContext'
import TopProgressBar from './components/ui/TopProgressBar'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <TopProgressBar />
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
