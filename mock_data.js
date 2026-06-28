// Dữ liệu mẫu ban đầu cho ứng dụng (Mock Data)

const DEFAULT_ACCOUNTS = [
  { username: 'admin', password: 'admin123', role: 'super_admin', department: 'all', name: 'Quản trị viên Hệ thống' },
  { username: 'student', password: '123456', role: 'student', department: 'none', name: 'Nguyễn Văn An', trungDoi: 'Trung đội 1', daiDoi: 'Đại đội 1', tieuDoan: 'Tiểu đoàn 1' },
  { username: 'developer', password: 'dev966', role: 'development', department: 'all', name: 'Nhà phát triển Hệ thống' }
];

const DEFAULT_DEPARTMENTS = {
  'K1': {
    name: 'Khoa Chiến thuật (K1)',
    icon: 'bi-people-fill',
    color: '#ffb300',
    subjects: [
      {
        id: 'k1_sub1',
        name: 'Lập trình Hướng đối tượng',
        password: '123456',
        exams: [
          {
            id: 'k1_sub1_exam2023',
            year: 'Đề thi năm 2023',
            questions: [
              {
                id: 'q1',
                type: 'choice',
                question: 'Trong lập trình hướng đối tượng (OOP), tính chất nào cho phép các đối tượng khác nhau phản hồi cùng một thông điệp theo các cách khác nhau?',
                options: {
                  A: 'Tính kế thừa (Inheritance)',
                  B: 'Tính đa hình (Polymorphism)',
                  C: 'Tính đóng gói (Encapsulation)',
                  D: 'Tính trừu tượng (Abstraction)'
                },
                correct: 'B',
                explanation: 'Tính đa hình cho phép các đối tượng thuộc các lớp khác nhau có thể phản hồi cùng một phương thức theo cách riêng của chúng.'
              },
              {
                id: 'q2',
                type: 'choice',
                question: 'Lớp trừu tượng (Abstract class) khác với Interface ở điểm nào sau đây?',
                options: {
                  A: 'Lớp trừu tượng không thể có các phương thức có thân hàm.',
                  B: 'Interface có thể kế thừa từ nhiều Interface khác, trong khi lớp trừu tượng chỉ có thể kế thừa từ một lớp đơn.',
                  C: 'Interface có thể chứa các thuộc tính thực thể (instance variables).',
                  D: 'Không có điểm nào khác biệt.'
                },
                correct: 'B',
                explanation: 'Hầu hết các ngôn ngữ như Java/C# cho phép đa kế thừa interface nhưng chỉ cho phép đơn kế thừa lớp (kể cả lớp trừu tượng).'
              },
              {
                id: 'q3',
                type: 'essay',
                question: 'Giải thích ngắn gọn ý nghĩa của phương thức khởi tạo (Constructor) trong OOP. Một lớp có thể có nhiều constructor không?',
                barem: '1. Khái niệm constructor khởi tạo đối tượng: 4 điểm.\n2. Đặc điểm (trùng tên lớp, không kiểu trả về): 3 điểm.\n3. Trả lời đúng có thể nạp chồng nhiều constructor: 3 điểm.',
                sampleAnswer: 'Constructor là phương thức đặc biệt dùng để khởi tạo đối tượng khi được tạo bằng từ khóa new. Nó có tên trùng với tên lớp và không có kiểu trả về. Một lớp có thể có nhiều constructor thông qua nạp chồng phương thức (overloading), giúp khởi tạo đối tượng bằng các tập tham số khác nhau.',
                explanation: 'Constructor dùng để thiết lập trạng thái ban đầu của đối tượng. Có thể nạp chồng (overload) nhiều constructor.'
              }
            ]
          },
          {
            id: 'k1_sub1_exam2024',
            year: 'Đề thi năm 2024',
            questions: [
              {
                id: 'q4',
                type: 'choice',
                question: 'Nguyên lý SOLID nào khuyến khích mở rộng tính năng của lớp mà không chỉnh sửa mã nguồn cũ?',
                options: {
                  A: 'Single Responsibility Principle',
                  B: 'Open/Closed Principle',
                  C: 'Liskov Substitution Principle',
                  D: 'Dependency Inversion Principle'
                },
                correct: 'B',
                explanation: 'Open/Closed Principle (OCP) phát biểu: Một thành phần phần mềm nên mở cho việc mở rộng (open for extension) nhưng đóng cho việc chỉnh sửa (closed for modification).'
              }
            ]
          }
        ]
      },
      {
        id: 'k1_sub2',
        name: 'Cấu trúc Dữ liệu & Giải thuật',
        exams: []
      },
      {
        id: 'k1_sub3',
        name: 'Vấn đáp Kỹ thuật Phần mềm',
        exams: [
          {
            id: 'k1_sub3_exam2024',
            year: 'Đề vấn đáp Kỹ thuật phần mềm 2024',
            questions: [
              {
                id: 'k1_vd_q1',
                type: 'interview',
                question: 'Hãy giải thích sự khác nhau giữa Overloading (nạp chồng) và Overriding (ghi đè) trong lập trình hướng đối tượng.',
                barem: '1. Định nghĩa và mục đích của Overloading (nạp chồng): 3 điểm.\n2. Định nghĩa và mục đích của Overriding (ghi đè): 3 điểm.\n3. So sánh chi tiết về vị trí định nghĩa (cùng lớp vs lớp cha-con) và chữ ký phương thức (signature): 3 điểm.\n4. Nêu được ví dụ minh họa: 1 điểm.',
                keywords: ['nạp chồng', 'ghi đè', 'overloading', 'overriding', 'chữ ký', 'kế thừa'],
                sampleAnswer: 'Overloading (nạp chồng) là việc tạo ra nhiều phương thức cùng tên trong cùng một lớp nhưng khác chữ ký (khác kiểu/số lượng tham số). Overriding (ghi đè) là việc lớp con định nghĩa lại một phương thức đã có ở lớp cha có cùng tên, cùng kiểu trả về và danh sách tham số để thực hiện hành vi đa hình.',
                explanation: 'Nạp chồng là đa hình tĩnh (compile-time), ghi đè là đa hình động (runtime).'
              },
              {
                id: 'k1_vd_q2',
                type: 'interview',
                question: 'Giải thích ngắn gọn nguyên lý hoạt động của cơ chế Garbage Collection (Dọn rác tự động) trong Java hoặc C#.',
                barem: '1. Định nghĩa cơ chế GC tự động giải phóng vùng nhớ Heap: 3 điểm.\n2. Giải thích khái niệm đối tượng không còn tham chiếu: 3 điểm.\n3. Giải thích được quy trình đánh dấu và quét (Mark and Sweep): 3 điểm.\n4. Nêu được tầm quan trọng để tránh Memory Leak: 1 điểm.',
                keywords: ['dọn rác', 'garbage', 'heap', 'tham chiếu', 'giải phóng', 'leak'],
                sampleAnswer: 'Garbage Collection (GC) là tiến trình chạy ngầm giúp tự động giải phóng vùng nhớ Heap của các đối tượng không còn bất kỳ biến nào tham chiếu tới. GC giúp lập trình viên không phải giải phóng bộ nhớ bằng tay và giảm thiểu lỗi rò rỉ bộ nhớ (Memory Leak). Quy trình cơ bản gồm đánh dấu (Mark) các đối tượng đang hoạt động và quét dọn (Sweep) những đối tượng chết.',
                explanation: 'GC tự động quản lý bộ nhớ Heap, giúp tăng tính an toàn và giảm lỗi con trỏ hoặc rò rỉ bộ nhớ.'
              }
            ]
          }
        ]
      }
    ]
  },
  'K2': {
    name: 'Khoa Khoa học Xã hội và Nhân văn (K2)',
    icon: 'bi-bookmark-star-fill',
    color: '#2e7d32',
    subjects: [
      {
        id: 'k2_sub1',
        name: 'Mật mã học cơ sở',
        password: '123456',
        exams: [
          {
            id: 'k2_sub1_exam2023',
            year: 'Đề thi năm 2023',
            questions: [
              {
                id: 'k2_q1',
                type: 'choice',
                question: 'Hệ mật mã khóa công khai RSA hoạt động dựa trên bài toán toán học nan giải nào?',
                options: {
                  A: 'Bài toán Logarit rời rạc',
                  B: 'Bài toán Phân tích số nguyên lớn ra thừa số nguyên tố',
                  C: 'Bài toán Thặng dư Trung Hoa',
                  D: 'Bài toán Xếp ba lô (Knapsack)'
                },
                correct: 'B',
                explanation: 'Độ an toàn của RSA dựa trên sự khó khăn của việc phân tích một số nguyên hợp số lớn (tích của hai số nguyên tố lớn) thành các thừa số nguyên tố.'
              },
              {
                id: 'k2_q2',
                type: 'essay',
                question: 'Sự khác biệt cốt lõi giữa mã hóa đối xứng (Symmetric Encryption) và mã hóa bất đối xứng (Asymmetric Encryption) là gì?',
                sampleAnswer: 'Mã hóa đối xứng sử dụng cùng một khóa duy nhất cho cả quá trình mã hóa và giải mã (ví dụ: AES, DES). Mã hóa bất đối xứng sử dụng một cặp khóa gồm khóa công khai (Public Key) để mã hóa và khóa bí mật (Private Key) để giải mã (ví dụ: RSA, ECC). Do đó mã hóa bất đối xứng giúp giải quyết bài toán phân phối khóa tốt hơn nhưng tốc độ xử lý chậm hơn.',
                explanation: 'Mấu chốt nằm ở số lượng khóa (1 khóa vs cặp khóa công khai/bí mật) và tính bảo mật của việc chia sẻ khóa.'
              }
            ]
          }
        ]
      }
    ]
  },
  'K3': {
    name: 'Khoa Công trình (K3)',
    icon: 'bi-bricks',
    color: '#ff5300',
    subjects: []
  },
  'K4': {
    name: 'Khoa Cầu đường Vượt sông (K4)',
    icon: 'bi-water',
    color: '#0284c7',
    subjects: []
  },
  'K5': {
    name: 'Khoa Xe máy (K5)',
    icon: 'bi-gear-fill',
    color: '#8b263e',
    subjects: []
  },
  'K6': {
    name: 'Khoa Cơ sở (K6)',
    icon: 'bi-magnet-fill',
    color: '#bf55ec',
    subjects: []
  },
  'K7': {
    name: 'Khoa Khoa học Cơ bản (K7)',
    icon: 'bi-calculator-fill',
    color: '#ff007f',
    subjects: []
  },
  'K8': {
    name: 'Khoa Quân sự chung (K8)',
    icon: 'bi-crosshair',
    color: '#9b59b6',
    subjects: []
  }
};

const DEFAULT_RESULTS = [
  {
    id: 'res1',
    studentName: 'Trần Minh Quân',
    unit: 'Trung đội 1 - Đại đội 1 - Tiểu đoàn 1',
    trungDoi: 'Trung đội 1',
    daiDoi: 'Đại đội 1',
    tieuDoan: 'Tiểu đoàn 1',
    departmentId: 'K1',
    departmentName: 'Khoa Chiến thuật (K1)',
    subjectName: 'Lập trình Hướng đối tượng',
    examYear: 'Đề thi năm 2023',
    score: 6.7, // 2/3 câu
    totalQuestions: 3,
    correctCount: 2,
    date: '2026-06-25 14:32'
  },
  {
    id: 'res2',
    studentName: 'An Đình Phong',
    unit: 'Trung đội 1 - Đại đội 1 - Tiểu đoàn 1',
    trungDoi: 'Trung đội 1',
    daiDoi: 'Đại đội 1',
    tieuDoan: 'Tiểu đoàn 1',
    departmentId: 'K1',
    departmentName: 'Khoa Chiến thuật (K1)',
    subjectName: 'Lập trình Hướng đối tượng',
    examYear: 'Đề thi năm 2023',
    score: 10.0, // 3/3 câu
    totalQuestions: 3,
    correctCount: 3,
    date: '2026-06-25 15:10'
  },
  {
    id: 'res3',
    studentName: 'Bùi Thị Hà',
    unit: 'Trung đội 2 - Đại đội 1 - Tiểu đoàn 1',
    trungDoi: 'Trung đội 2',
    daiDoi: 'Đại đội 1',
    tieuDoan: 'Tiểu đoàn 1',
    departmentId: 'K1',
    departmentName: 'Khoa Chiến thuật (K1)',
    subjectName: 'Lập trình Hướng đối tượng',
    examYear: 'Đề thi năm 2023',
    score: 3.3, // 1/3 câu
    totalQuestions: 3,
    correctCount: 1,
    date: '2026-06-26 09:12'
  },
  {
    id: 'res4',
    studentName: 'Vũ Đức Duy',
    unit: 'Trung đội 3 - Đại đội 2 - Tiểu đoàn 1',
    trungDoi: 'Trung đội 3',
    daiDoi: 'Đại đội 2',
    tieuDoan: 'Tiểu đoàn 1',
    departmentId: 'K2',
    departmentName: 'Khoa Khoa học Xã hội và Nhân văn (K2)',
    subjectName: 'Mật mã học cơ sở',
    examYear: 'Đề thi năm 2023',
    score: 10.0, // 2/2 câu
    totalQuestions: 2,
    correctCount: 2,
    date: '2026-06-26 11:20'
  },
  {
    id: 'res5',
    studentName: 'Cao Hoàng Bách',
    unit: 'Trung đội 3 - Đại đội 2 - Tiểu đoàn 1',
    trungDoi: 'Trung đội 3',
    daiDoi: 'Đại đội 2',
    tieuDoan: 'Tiểu đoàn 1',
    departmentId: 'K2',
    departmentName: 'Khoa Khoa học Xã hội và Nhân văn (K2)',
    subjectName: 'Mật mã học cơ sở',
    examYear: 'Đề thi năm 2023',
    score: 5.0, // 1/2 câu
    totalQuestions: 2,
    correctCount: 1,
    date: '2026-06-26 13:05'
  }
];
