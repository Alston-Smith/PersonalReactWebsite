import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useState, useEffect } from 'react'
import './index.css'
import Bio from './components/Bio.jsx'
import Test from './components/Test.jsx'
import TicTacToe from './components/TicTacToe.jsx'
import TicTacToeTest from './components/TicTacToeTest.jsx'
import Banner from './components/Banner.jsx'



createRoot(document.getElementById('root')).render(
    <StrictMode>
        {/* Background is a fixed-position element that must not wrap the app content.
            Render it as a sibling so the app can scroll normally while the background
            stays fixed behind (z-index: -1). */}
        <div className="backGroundImage" />

        <div className="appContent">
            <SetupContent passedPageSelection={"Bio"} />
        </div>
    </StrictMode>
)

export function SetupContent({ passedPageSelection }) {
    const [pages, setPages] = useState(["Bio", "Test", "TicTacToe"]);
    const [page, setPage] = useState(null);

    // Initialize page from passedPageSelection when the component mounts or when it changes.
    // Avoid using DOMContentLoaded inside a React component � useEffect is the correct hook.
    useEffect(() => {
        if (passedPageSelection != null) {
            console.log('Page Selection (prop): ' + passedPageSelection);
            setPage(checkPageSelection(passedPageSelection));
        } else {
            console.log('No Page Selection Detected, Page Selection: ' + passedPageSelection);
        }
    }, [passedPageSelection]);


    function handlePageSelection(page) {
        console.log("Clicked page selection button for " + page); 
        setPage(checkPageSelection(page));
    }

    function checkPageSelection(page) {
        // Dynamically map page name to the corresponding component
        const componentMap = {
            Bio,
            Test,
            TicTacToe,
            TicTacToeTest
        };

        const Component = componentMap[page];
        return Component ? <Component /> : null;
    }

    function dropDownPageSelection() {
        // Start with an empty placeholder value so the user explicitly chooses a page.
        return (
            <select onChange={(e) => handlePageSelection(e.target.value)} defaultValue={""}>
                <option value="" disabled>Select a page</option>
                {pages.map(p => (<option key={p} value={p}>{p}</option>))}
            </select>
        );
    }

    

    console.log("Page: " + page);

    // Always display the dropdown page selector at the top of the UI
    // <Banner pages={pages} onPageSelection={handlePageSelection} />
    return (
        <StrictMode>
            <section id="Banner">
                <div className="Banner">
                    <Banner pages={pages} onPageSelection={handlePageSelection} /> 
                </div>
            </section>
            <div className="Page">
                {page}
            </div>
        </StrictMode>
    );
}