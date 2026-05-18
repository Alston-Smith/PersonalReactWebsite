import './Banner.css'

// Banner receives a list of page names and a callback for selection
export default function Banner({ pages = [], onPageSelection }) {
    const bannerHeaderText = "Alston Smith";
    const bannerSubHeaderText = "Made with React Without The Use Of External Component Or Design Libraries";

    function dropDownPageSelection() {
        const defaultVal = pages.length > 0 ? pages[0] : "";
        return (
            <select onChange={(e) => onPageSelection(e.target.value)} defaultValue={defaultVal}>
                <option value="" disabled>Select a page</option>
                {pages.map(p => ( <option key={p} value={p}>{p}</option> ))}
            </select>
        );
    }

    function pageSelectionButtons() {
        return (
            <div className="pageButtons">
                {pages.map(p => (
                    <button key={p} onClick={() => onPageSelection(p)} type="button">{p}</button>
                ))}
            </div>
        );
    }

    //<div style={{ marginBottom: '1rem' }}>{dropDownPageSelection()}</div>
    return (
        <div className="banner">
            <section id="banner">
                <section id="bannerHeader">
                    <div className="bannerHeader">{bannerHeaderText}</div>
                    <div className="bannerSubHeader">{bannerSubHeaderText}</div>
                </section>
                <section id="pageSelection">
                    <div style={{ marginBottom: '1rem' }}>{pageSelectionButtons()}</div>
                </section>
            </section>
        </div>
    );
}
