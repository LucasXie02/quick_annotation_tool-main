import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
// Vite config tailored for the annotation tool SPA.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        host: '0.0.0.0'
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true
    }
});
