/*
* This is the "robot" script.
* It uses Puppeteer to control a Chrome browser.
* It is imported by `agent_server.js`.
*/

const puppeteer = require('puppeteer');

// !!! --- THIS IS YOUR CORRECT URL --- !!!
const EID_PORTAL_URL = 'https://profound-conkies-c25ade.netlify.app/#';
// !!! --- THIS IS YOUR CORRECT URL --- !!!


async function getCaptchaScreenshot(page, captchaViewId) {
    const captchaViewSelector = `#${captchaViewId}`;
    await page.waitForSelector(captchaViewSelector, { visible: true });
    const captchaElement = await page.$(captchaViewSelector); // The whole CAPTCHA page
    if (!captchaElement) throw new Error(`Could not find CAPTCHA view: ${captchaViewId}`);
    return await captchaElement.screenshot({ encoding: 'base64' });
}


// --- Agent 1: Registration ---
async function automateRegistration(userData, getCaptchaInput, sendLog) {
    // ---*** DEBUG: headless:false and slowMo ***---
    sendLog('Launching VISIBLE browser for Registration...');
    const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();
    
    try {
        await page.goto(EID_PORTAL_URL);
        const pageTitle = await page.title();
        // ---*** TYPO FIX: "Mapsd" -> "Navigated" ***---
        sendLog(`Mapsd to E-ID portal. Page title is: "${pageTitle}"`);

        const navBarSelector = 'nav.bg-blue-800';
        await page.waitForSelector(navBarSelector, { timeout: 10000 }); // Wait 10s
        
        const menuSelector = 'nav .dropdown:first-child';
        sendLog('Hovering over "My E-ID" menu...');
        await page.hover(menuSelector); 
        
        // Wait for the button to appear in the dropdown
        await page.waitForSelector('#navRegister', { visible: true, timeout: 5000 });
        await page.click('#navRegister');

        await page.waitForSelector('#registerView', { visible: true });
        sendLog('On registration page. Filling form...');

        await page.type('#reg-name', userData.name);
        
        // The AI "brain" now formats this as YYYY-MM-DD
        await page.evaluate((date) => {
            document.getElementById('reg-dob').value = date;
        }, userData.dob);
        
        await page.select('#reg-gender', userData.gender);
        await page.type('#reg-phone', userData.phone);
        await page.type('#reg-address', userData.address);
        sendLog('Form filled. Proceeding to security check...');

        await page.click('#registerButton');

        const screenshot = await getCaptchaScreenshot(page, 'captchaView');
        sendLog('CAPTCHA detected. Requesting human input...');
        
        const captchaCode = await getCaptchaInput(screenshot);
        sendLog(`Human provided CAPTCHA. Submitting...`);
        
        await page.type('#captchaInput', captchaCode);
        await page.click('#verifyCaptchaButton');

        await page.waitForSelector('#registerSuccessBox, #registerErrorBox', { visible: true });
        
        const successBox = await page.$('#registerSuccessBox:not(.hidden)');
        if (successBox) {
            const eId = await page.$eval('#newEIdNumber', el => el.textContent);
            sendLog(`Registration Successful! New E-ID: ${eId}`);
            await new Promise(r => setTimeout(r, 2000)); // Pause to see success
            await browser.close();
            return { success: true, eId: eId };
        } else {
            const errorBox = await page.$('#registerErrorBox:not(.hidden)');
            let error = 'Registration failed. Unknown error.';
            if (errorBox) {
                error = await page.$eval('#registerErrorMessage', el => el.textContent);
            }
            sendLog(`Registration Failed. Reason: ${error}`);
            await new Promise(r => setTimeout(r, 2000)); // Pause to see error
            await browser.close();
            return { success: false, error: error };
        }
    } catch (err) {
        console.error('Agent: An unexpected error occurred:', err);
        sendLog(`Agent crash: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000)); // Pause to see crash
        await browser.close();
        return { success: false, error: 'Automation script failed: ' + err.message };
    }
}

// --- Agent 2: Download ---
async function automateDownload(eId, getCaptchaInput, sendLog) {
    sendLog('Launching VISIBLE browser for Download...');
    const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();
    
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: '/tmp' 
    });

    await page.goto(EID_PORTAL_URL);
    const pageTitle = await page.title();
    // ---*** TYPO FIX: "Mapsd" -> "Navigated" ***---
    sendLog(`Mapsd to E-ID portal. Page title is: "${pageTitle}"`);

    try {
        const navBarSelector = 'nav.bg-blue-800';
        await page.waitForSelector(navBarSelector, { timeout: 10000 });
        
        const menuSelector = 'nav .dropdown:first-child';
        sendLog('Hovering over "My E-ID" menu...');
        await page.hover(menuSelector); 
        
        await page.waitForSelector('#navSearch', { visible: true, timeout: 5000 });
        await page.click('#navSearch');

        await page.waitForSelector('#searchView', { visible: true });
        sendLog('On search page.');

        await page.type('#eid-number-search', eId);
        await page.click('#searchButton');
        sendLog(`Searching for E-ID: ${eId}...`);

        await page.waitForSelector('#resultsCard, #searchErrorBox', { visible: true });
        
        const errorBox = await page.$('#searchErrorBox:not(.hidden)');
        if (errorBox) {
            const error = await page.$eval('#searchErrorMessage', el => el.textContent);
            sendLog(`Search Failed. Reason: ${error}`);
            await new Promise(r => setTimeout(r, 2000));
            await browser.close();
            return { success: false, error: error };
        }
        
        sendLog('E-ID found. Proceeding to download security check...');
        
        // ---*** THIS IS THE FIX (3 parts) ***---

        // 1. Wait for the download button to be ENABLED
        const downloadButtonSelector = '#downloadButton:not([disabled])';
        sendLog('Waiting for download button to be enabled...');
        await page.waitForSelector(downloadButtonSelector, { visible: true, timeout: 10000 });

        // 2. Scroll the button into view
        sendLog('Scrolling to download button...');
        await page.evaluate(() => {
            document.querySelector('#downloadButton').scrollIntoView({ block: 'center' });
        });
        await new Promise(r => setTimeout(r, 100)); // Wait for scroll

        // 3. Click the button
        sendLog('Clicking download button...');
        await page.click(downloadButtonSelector);
        
        // ---*** END OF FIX ***---

        const screenshot = await getCaptchaScreenshot(page, 'captchaView');
        sendLog('CAPTCHA detected. Requesting human input...');
        
        const captchaCode = await getCaptchaInput(screenshot);
        sendLog(`Human provided CAPTCHA. Submitting...`);
        
        let downloadedData = null;
        page.on('response', async (response) => {
             if (response.url().startsWith('data:text/plain')) {
                downloadedData = await response.buffer();
             }
        });
        
        await page.type('#captchaInput', captchaCode);
        await page.click('#verifyCaptchaButton');

        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for download
        
        await browser.close();

        if (downloadedData) {
            sendLog('Download successful!');
            return { success: true, data: downloadedData.toString('utf-8') };
        } else {
            sendLog('Download failed. CAPTCHA was likely incorrect.');
            return { success: false, error: 'Download failed. CAPTCHA may have been incorrect.' };
        }
    } catch (err) {
        console.error('Agent: An unexpected error occurred:', err);
        sendLog(`Agent crash: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000));
        await browser.close();
        return { success: false, error: 'Automation script failed: ' + err.message };
    }
}

// --- NEW Agent 3: Update ---
async function automateUpdate(updateData, getCaptchaInput, sendLog) {
    sendLog('Launching VISIBLE browser for Update...');
    const browser = await puppeteer.launch({ headless: false, slowMo: 50 });
    const page = await browser.newPage();

    const { eId, name, phone, address } = updateData;

    try {
        await page.goto(EID_PORTAL_URL);
        const pageTitle = await page.title();
        // ---*** TYPO FIX: "Mapsd" -> "Navigated" ***---
        sendLog(`Mapsd to E-ID portal. Page title is: "${pageTitle}"`);

        const navBarSelector = 'nav.bg-blue-800';
        await page.waitForSelector(navBarSelector, { timeout: 10000 });

        const menuSelector = 'nav .dropdown:first-child';
        sendLog('Hovering over "My E-ID" menu...');
        await page.hover(menuSelector); 
        
        await page.waitForSelector('#navUpdate', { visible: true, timeout: 5000 });
        await page.click('#navUpdate');

        await page.waitForSelector('#updateView', { visible: true });
        sendLog('On update page. Finding user...');

        // Step 1: Find the user
        await page.type('#eid-number-update', eId);
        await page.click('#findUserButton');

        await page.waitForSelector('#updateStep2, #updateFindErrorBox', { visible: true });

        const errorBoxFind = await page.$('#updateFindErrorBox:not(.hidden)');
        if (errorBoxFind) {
            const error = await page.$eval('#updateFindErrorMessage', el => el.textContent);
            sendLog(`Find User Failed. Reason: ${error}`);
            await new Promise(r => setTimeout(r, 2000));
            await browser.close();
            return { success: false, error: error };
        }

        sendLog('User found. Unlocking fields to update...');

        // Step 2: Edit the fields
        if (name) {
            await page.click('button[data-field="update-name"]');
            await page.evaluate(() => (document.getElementById('update-name').value = ''));
            await page.type('#update-name', name);
            sendLog(`Updating name to: ${name}`);
        }
        if (phone) {
            await page.click('button[data-field="update-phone"]');
            await page.evaluate(() => (document.getElementById('update-phone').value = ''));
            await page.type('#update-phone', phone);
            sendLog(`Updating phone to: ${phone}`);
        }
        if (address) {
            await page.click('button[data-field="update-address"]');
            await page.evaluate(() => (document.getElementById('update-address').value = ''));
            await page.type('#update-address', address);
            sendLog(`Updating address to: ${address}`);
        }

        await page.click('#updateSaveChangesButton');

        // Step 3: Solve CAPTCHA
        const screenshot = await getCaptchaScreenshot(page, 'captchaView');
        sendLog('CAPTCHA detected. Requesting human input...');
        
        const captchaCode = await getCaptchaInput(screenshot);
        sendLog(`Human provided CAPTCHA. Submitting...`);
        
        await page.type('#captchaInput', captchaCode);
        await page.click('#verifyCaptchaButton');

        // Step 4: Get result
        await page.waitForSelector('#updateStep1', { visible: true });

        const successBox = await page.$('#updateSuccessBox:not(.hidden)');
        if (successBox) {
            sendLog('Update Successful!');
            await new Promise(r => setTimeout(r, 2000));
            await browser.close();
            return { success: true, message: "Update successful" };
        } else {
            const errorBoxUpdate = await page.$('#updateErrorBox:not(.hidden)');
            let error = 'Update failed. Unknown error.';
            if (errorBoxUpdate) {
                 error = await page.$eval('#updateErrorMessage', el => el.textContent);
            }
            sendLog(`Update Failed. Reason: ${error}`);
            await new Promise(r => setTimeout(r, 2000));
            await browser.close();
            return { success: false, error: error };
        }

    } catch (err) {
        console.error('Agent: An unexpected error occurred:', err);
        sendLog(`Agent crash: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000));
        await browser.close();
        return { success: false, error: 'Automation script failed: ' + err.message };
    }
}

module.exports = {
    automateRegistration,
    automateDownload,
    automateUpdate // Export the new function
};
