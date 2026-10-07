'use strict'
const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')
const { registerIpc } = require('./ipc')

let win = null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1040,
    minHeight: 660,
    title: 'CS2 优化助手',
    backgroundColor: '#0d1117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  win.on('closed', function () { win = null })
}

app.whenReady().then(function () {
  Menu.setApplicationMenu(null)
  registerIpc()
  createWindow()
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})
