// utils/fakeData.js

const allCourses = [
  { id: 1, title: "React for Beginners", category: "Web Dev", students: 200, price: 50, views: 400, image: "/images/react.jpg", date: "2025-10-15", desc: "Learn React step-by-step" },
  { id: 2, title: "Python Data Science", category: "Data", students: 300, price: 40, views: 350, image: "/images/python.jpg", date: "2025-10-10", desc: "Data science with Python" },
  { id: 3, title: "UI/UX Design Basics", category: "Design", students: 150, price: 45, views: 220, image: "/images/design.jpg", date: "2025-10-05", desc: "Master the fundamentals" },
  { id: 4, title: "C# for Developers", category: "Programming", students: 180, price: 60, views: 280, image: "/images/csharp.jpg", date: "2025-10-01", desc: "Build strong C# skills" },
  // thêm vài khóa học nữa nếu muốn
];

// --- Các hàm dữ liệu --- //

export async function getFeaturedCourses() {
  return allCourses.slice(0, 3);
}

export async function getPopularCourses() {
  return allCourses.sort((a, b) => b.views - a.views).slice(0, 3);
}

export async function getNewestCourses() {
  return allCourses.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
}

export async function getHotCategories() {
  const categoryMap = {};
  for (const c of allCourses) {
    categoryMap[c.category] = (categoryMap[c.category] || 0) + c.students;
  }
  return Object.entries(categoryMap)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);
}

export async function getCourses({ page = 1, limit = 6, search = "", category = "", sort = "newest" }) {
  let filtered = allCourses;

  // Search
  if (search) {
    filtered = filtered.filter(c => c.title.toLowerCase().includes(search.toLowerCase()));
  }

  // Filter by category
  if (category) {
    filtered = filtered.filter(c => c.category === category);
  }

  // Sort
  if (sort === "popular") filtered.sort((a, b) => b.views - a.views);
  else if (sort === "price_asc") filtered.sort((a, b) => a.price - b.price);
  else if (sort === "price_desc") filtered.sort((a, b) => b.price - a.price);
  else if (sort === "newest") filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  const total = filtered.length;
  const start = (page - 1) * limit;
  const end = start + limit;
  const courses = filtered.slice(start, end);

  return { courses, total };
}

export async function getCourseById(id) {
  return allCourses.find(c => c.id === id);
}
