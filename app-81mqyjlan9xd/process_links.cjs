const XLSX = require('xlsx');
const fs = require('fs');

try {
    const workbook = XLSX.readFile('links.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(worksheet['!ref']);

    const extractedData = [];
    let currentCategory = "General"; // Default

    for (let R = range.s.r; R <= range.e.r; ++R) {
        // Skip header row if it matches "Problems"
        if (R === 0) continue;

        const cellTitleRef = XLSX.utils.encode_cell({ c: 0, r: R }); // Col A
        const cellLinkRef = XLSX.utils.encode_cell({ c: 1, r: R });  // Col B

        const cellTitle = worksheet[cellTitleRef];
        const cellLink = worksheet[cellLinkRef];

        if (!cellTitle || !cellTitle.v) continue; // Skip empty titles

        const textVal = cellTitle.v.toString().trim();

        // CHECK IF CATEGORY HEADER
        // Logic: If Col 1 (Link) is empty, this Row is likely a Category Header
        const isLinkCellEmpty = !cellLink || (!cellLink.v && !cellLink.l);

        if (isLinkCellEmpty) {
            currentCategory = textVal;
            // console.log(`Found Category: ${currentCategory}`);
            continue;
        }

        // PROCESS LESSON ROW
        let title = textVal;
        let url = '';

        // Extract URL from Col 1
        if (cellLink) {
            if (cellLink.l && cellLink.l.Target) {
                url = cellLink.l.Target;
            } else if (cellLink.v && typeof cellLink.v === 'string' && cellLink.v.startsWith('http')) {
                url = cellLink.v.trim();
            }
        }

        // Fallback: Check Title Col for URL
        if (!url && cellTitle.l && cellTitle.l.Target) {
            url = cellTitle.l.Target;
        }

        if (url) {
            extractedData.push({
                title,
                url,
                category: currentCategory
            });
        }
    }

    console.log(`Extracted ${extractedData.length} links with Categories.`);
    fs.writeFileSync('extracted_links.json', JSON.stringify(extractedData, null, 2));

} catch (e) {
    console.error("Error processing Excel:", e);
}
