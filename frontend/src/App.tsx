import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import IntroScreen from './pages/IntroScreen';
import ModeSelect from './pages/ModeSelect';
import AIPresentationSetup from './pages/AIPresentationSetup';
import ManualUpload from './pages/ManualUpload';
import Editor from './pages/Editor';
import Presenter from './pages/Presenter';
import JoinSession from './pages/JoinSession';

export default function App() {
  return (
    <div className="app-shell">
      <HashRouter>
        <Routes>
          <Route path="/" element={<IntroScreen />} />
          <Route path="/select" element={<ModeSelect />} />
          <Route path="/ai/new" element={<AIPresentationSetup />} />
          <Route path="/manual" element={<ManualUpload />} />
          <Route path="/editor/:id" element={<Editor />} />
          <Route path="/presenter/:id" element={<Presenter />} />
          <Route path="/join/:code" element={<JoinSession />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </div>
  );
}
