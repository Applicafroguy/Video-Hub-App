import { app, BrowserWindow, screen } from 'electron';
import * as path from 'path';

let win, serve;
const args = process.argv.slice(1);
serve = args.some(val => val === '--serve');

if (serve) {
  require('electron-reload')(__dirname, {
  });
}

function createWindow() {

  const electronScreen = screen;
  const size = electronScreen.getPrimaryDisplay().workAreaSize;

  // Create the browser window.
  win = new BrowserWindow({
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
    icon: path.join(__dirname, 'assets/icons/png/64x64.png')
  });

  // and load the index.html of the app.
  win.loadURL('file://' + __dirname + '/index.html');

  // Open the DevTools.
  if (serve) {
    win.webContents.openDevTools();
  }

  // Emitted when the window is closed.
  win.on('closed', () => {
    // Dereference the window object, usually you would store window
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null;
  });
}

try {

  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.on('ready', createWindow);

  // Quit when all windows are closed.
  app.on('window-all-closed', () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
      createWindow();
    }
  });

} catch (e) {
  // Catch Error
  // throw e;
}

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// ============================================================
// My imports
// ============================================================

const fs = require('fs');

const dialog = require('electron').dialog;
const ipc = require('electron').ipcMain;
const shell = require('electron').shell;

const ffprobePath = require('@ffprobe-installer/ffprobe').path;
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfprobePath(ffprobePath);
ffmpeg.setFfmpegPath(ffmpegPath);

// ============================================================
// My variables
// ============================================================

import { FinalObject } from './src/app/components/common/final-object.interface';

let finalArray = [];
let fileCounter = 0;

let totalNumberOfFiles = 0;
let filesProcessed = 1;

let selectedSourceFolder = '';  // later = ''
let selectedOutputFolder = '/Users/byakubchik/Desktop/VideoHub/output'; // later = ''

let theOriginalOpenFileDialogEvent;

/**
 * Summon system modal to choose directory from which to import videos
 */
ipc.on('open-file-dialog', function (event, someMessage) {
  // console.log(someMessage);
  finalArray = [];
  fileCounter = 0;

  // ask user for input folder
  dialog.showOpenDialog({
    properties: ['openDirectory']
  }, function (files) {
    if (files) {
      console.log('the user has chosen this directory: ' + files[0]);
      selectedSourceFolder = files[0];

      // no need to return anything, walkSync updates `finalArray`
      // second param is needed for its own recursion
      walkSync(selectedSourceFolder, []);

      // store the reference to the Angular app
      theOriginalOpenFileDialogEvent = event;

      // reset files Processed
      filesProcessed = 1;
      extractAllScreenshots();
    }
  })
})

/**
 * Summon system modal to choose output directory
 * where the final json and all screenshots will be saved
 */
ipc.on('choose-output', function (event, someMessage) {

  // ask user for input folder
  dialog.showOpenDialog({
    properties: ['openDirectory']
  }, function (files) {
    if (files) {
      console.log('the user has chosen this OUTPUT directory: ' + files[0]);
      selectedOutputFolder = files[0];

      // create "/boris" inside the output directory it so that there is no `EEXIST` error when extracting.
      if (!fs.existsSync(selectedOutputFolder + '/boris')) {
        console.log('boris folder did not exist, creating');
        fs.mkdirSync(selectedOutputFolder + '/boris');
      }

      event.sender.send('outputFolderChosen', selectedOutputFolder);
    }
  })
})

/**
 * Summon system modal to choose the images.json file
 */
ipc.on('load-the-file', function (event, somethingElse) {
  // console.log(somethingElse);

  dialog.showOpenDialog({
      properties: ['openFile']
    }, function (files) {
      if (files) {
        console.log('the user has chosen this previously-saved json file: ' + files[0]);
        // TODO: check if file ends in .json before parsing !!!
        selectedOutputFolder = files[0].replace('/images.json', '');

        fs.readFile(selectedOutputFolder + '/images.json', (err, data) => {
          if (err) {
            throw err;
          }
          event.sender.send('finalObjectReturning', JSON.parse(data));
        });

      }
    })

})

ipc.on('openThisFile', function (event, fullFilePath) {
  shell.openItem(fullFilePath);
})

/**
 * Extract all screenshots
 * by calling extractScreenshot on every item in finalArray[]
 */
function extractAllScreenshots() {
  // console.log(finalArray);
  totalNumberOfFiles = finalArray.length;
  console.log('there are a total of: ' + totalNumberOfFiles + ' files');
  finalArray.forEach((element, index) => {
    // console.log('forEach running:');
    // console.log(element);
    // console.log(index);
    extractScreenshot(path.join(selectedSourceFolder, element[0], element[1]), index);
  });
}

/**
 * Extract all screenshots from a particular file
 * Writes files to HD
 * Updates finalArray with array of files written to disk
 * Calls function to send progress or to send final result home
 * @param filePath
 * @param currentFile
 */
function extractScreenshot(filePath: string, currentFile: number): void {
  // console.log('file:///' + filePath);
  const theFile = 'file:///' + filePath;

  ffmpeg(theFile)
    .on('filenames', function (filenames) {
      // console.log('Screenshots: ' + filenames.join(', '));
      finalArray[currentFile][3] = [];
      // prepend partial path to each
      filenames.forEach((element, index) => {
        finalArray[currentFile][3][index] = '/boris/' + element;
      });
      // console.log(finalArray[currentFile][3]);
    })
    .on('end', function () {
      console.log('processed ' + filesProcessed + ' out of ' + totalNumberOfFiles);
      filesProcessed++;
      if (filesProcessed === totalNumberOfFiles + 1) {
        sendFinalResultHome();
      } else {
        sendCurrentProgress(filesProcessed, totalNumberOfFiles);
      }
    })
    .screenshots({
      // count: 10, // can do count rather than timestamps
      // timestamps: ['25%', '50%', '75%'],
      timestamps: ['10%', '30%', '50%', '70%', '90%'],
      // timestamps: ['5%', '15%', '25%', '35%', '45%', '55%', '65%', '75%', '85%', '95%'],
      filename: currentFile + '-%i.png',
      folder: selectedOutputFolder + '/boris',
      size: '?x100' // fix height at 100px compute width automatically
    });
}

/**
 * Sends progress to Angular App
 * @param current number
 * @param total unmber
 */
function sendCurrentProgress(current: number, total: number): void {
  theOriginalOpenFileDialogEvent.sender.send('processingProgress', current, total);
}

/**
 * Writes the json file and sends contents back to Angular App
 */
function sendFinalResultHome() {

  const finalObject: FinalObject = {
    inputDir: selectedSourceFolder,
    outputDir: selectedOutputFolder,
    images: finalArray
  };

  const json = JSON.stringify(finalObject);
  // write the file
  fs.writeFile(selectedOutputFolder + '/images.json', json, 'utf8', () => {
    console.log('file written:');
    theOriginalOpenFileDialogEvent.sender.send('finalObjectReturning', JSON.parse(json));
  });
}

/**
 * Recursively walk through the input directory
 * compiling files to process
 * updates the finalArray[]
 */
function walkSync(dir, filelist) {
  // console.log('walk started');
  const files = fs.readdirSync(dir);
  // console.log(files);

  files.forEach(function (file) {
    // if the item is a _DIRECTORY_
    if (fs.statSync(path.join(dir, file)).isDirectory()) {
      filelist = walkSync(path.join(dir, file), filelist);
    } else {
      // if file type is .mp4, .m4v, or .avi
      if (file.indexOf('.mp4') !== -1
        || file.indexOf('.avi') !== -1
        || file.indexOf('.m4v') !== -1) {
        // before adding, remove the redundant prefix: selectedSourceFolder
        const partialPath = dir.replace(selectedSourceFolder, '');

        const cleanFileName = cleanUpFileName(file);

        finalArray[fileCounter] = [partialPath, file, cleanFileName];
        fileCounter++;
      }
    }
  });

  return filelist;
};

/**
 * Clean up the file name
 * (1) underscores
 * (2) double spaces / tripple spaces
 * (3) remove filename
 * (4) strip periods
 * @param original {string}
 * @return {string}
 */
function cleanUpFileName(original: string): string {
  let result = original;

  result = result.split('_').join(' ');               // (1)
  result = result.split('.').slice(0, -1).join('.');  // (3)
  result = result.split('.').join(' ');               // (4)

  result = result.split('   ').join(' ');              // (2)
  result = result.split('  ').join(' ');               // (2)

  return result;
}

// ============================================================
// MISC
// ============================================================


