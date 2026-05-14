const XLSX = require('xlsx');

try {
    const workbook = XLSX.readFile('links.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON array of arrays to see strict grid structure
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: 0 }); // range 0 to read all

    console.log("Total Rows:", data.length);
    console.log("--- FIRST 20 ROWS ---");
    data.slice(0, 20).forEach((row, i) => {
        console.log(`[Row ${i}]:`, JSON.stringify(row));
    });

} catch (e) {
    console.error("Error reading Excel:", e);
}
