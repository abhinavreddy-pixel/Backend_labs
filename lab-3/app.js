const express = require("express");
const Database = require("better-sqlite3");

const app = express();
app.use(express.json());

// Create the database file and table if they don't exist yet.
const db = new Database("books.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    price REAL NOT NULL
  )
`);

function validBook(body) {
  const { title, author, price } = body || {};

  return (
    typeof title === "string" &&
    title.trim().length > 0 &&
    typeof author === "string" &&
    author.trim().length > 0 &&
    price !== undefined &&
    price !== null &&
    price !== "" &&
    Number.isFinite(Number(price))
  );
}

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Lab 3 API is running" });
});

// List, search, sort, paginate, and filter books
app.get("/books", (req, res) => {
  const {
    search_q = "",
    order_by = "title",
    order = "ASC",
    limit = "10",
    offset = "0",
    min_price,
    max_price,
  } = req.query;

  const allowedColumns = ["title", "author", "price"];
  const safeOrder = String(order).toUpperCase();

  if (!allowedColumns.includes(order_by)) {
    return res.status(400).json({ message: "order_by must be title, author, or price" });
  }

  if (!["ASC", "DESC"].includes(safeOrder)) {
    return res.status(400).json({ message: "order must be ASC or DESC" });
  }

  const pageLimit = Number(limit);
  const pageOffset = Number(offset);

  if (!Number.isInteger(pageLimit) || pageLimit < 1) {
    return res.status(400).json({ message: "limit must be a positive integer" });
  }

  if (!Number.isInteger(pageOffset) || pageOffset < 0) {
    return res.status(400).json({ message: "offset must be zero or a positive integer" });
  }

  if (min_price !== undefined && !Number.isFinite(Number(min_price))) {
    return res.status(400).json({ message: "min_price must be numeric" });
  }

  if (max_price !== undefined && !Number.isFinite(Number(max_price))) {
    return res.status(400).json({ message: "max_price must be numeric" });
  }

  if (
    min_price !== undefined &&
    max_price !== undefined &&
    Number(min_price) > Number(max_price)
  ) {
    return res.status(400).json({ message: "min_price cannot be greater than max_price" });
  }

  let sql = "SELECT * FROM books WHERE title LIKE ?";
  const params = [`%${search_q}%`];

  if (min_price !== undefined) {
    sql += " AND price >= ?";
    params.push(Number(min_price));
  }

  if (max_price !== undefined) {
    sql += " AND price <= ?";
    params.push(Number(max_price));
  }

  // order_by and order are checked against allowlists above.
  sql += ` ORDER BY ${order_by} ${safeOrder} LIMIT ? OFFSET ?`;
  params.push(pageLimit, pageOffset);

  const books = db.prepare(sql).all(...params);
  res.status(200).json(books);
});

// Get one book
app.get("/books/:id", (req, res) => {
  const book = db.prepare("SELECT * FROM books WHERE id = ?").get(req.params.id);

  if (!book) {
    return res.status(404).json({ message: "Book not found" });
  }

  res.status(200).json(book);
});

// Create a book
app.post("/books", (req, res) => {
  if (!validBook(req.body)) {
    return res.status(400).json({
      message: "title, author, and a numeric price are required",
    });
  }

  const { title, author, price } = req.body;

  const result = db
    .prepare("INSERT INTO books (title, author, price) VALUES (?, ?, ?)")
    .run(title.trim(), author.trim(), Number(price));

  const book = db
    .prepare("SELECT * FROM books WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json(book);
});

// Update a book
app.put("/books/:id", (req, res) => {
  const existingBook = db
    .prepare("SELECT * FROM books WHERE id = ?")
    .get(req.params.id);

  if (!existingBook) {
    return res.status(404).json({ message: "Book not found" });
  }

  if (!validBook(req.body)) {
    return res.status(400).json({
      message: "title, author, and a numeric price are required",
    });
  }

  const { title, author, price } = req.body;

  db.prepare(
    "UPDATE books SET title = ?, author = ?, price = ? WHERE id = ?"
  ).run(title.trim(), author.trim(), Number(price), req.params.id);

  const updatedBook = db
    .prepare("SELECT * FROM books WHERE id = ?")
    .get(req.params.id);

  res.status(200).json(updatedBook);
});

// Delete a book
app.delete("/books/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM books WHERE id = ?")
    .run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ message: "Book not found" });
  }

  res.status(200).json({ message: "Book deleted successfully" });
});

// Return a clear JSON error if the request body contains invalid JSON.
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ message: "Request body contains invalid JSON" });
  }

  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});