import './ui/tokens.css';
import './features/canvas/node-resize.css';
import './features/workspace/original-workbench.css';
import './features/workspace/workspace.css';
import './features/settings/api-settings.css';
import {createRoot} from 'react-dom/client';
import {App} from './app/App';
createRoot(document.getElementById('root')!).render(<App/>);
