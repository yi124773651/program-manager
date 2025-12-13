import { createApp } from 'vue'
import { createPinia } from 'pinia'
import NotesWindow from './NotesWindow.vue'
import './style.css'

const pinia = createPinia()
const app = createApp(NotesWindow)

app.use(pinia)
app.mount('#app')
