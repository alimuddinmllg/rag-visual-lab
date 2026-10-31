// Sample documents. Fictional text written for the lab, one per language.
// Sections start with "## ". Keep both versions saying the same things.

export const NUSABOT_EN = `## About the lab
NusaBot Robotics Lab is a shared maker space for students and researchers. Members build robots, sensors and small electronics projects. The lab has soldering stations, a laser cutter, two 3D printers and a parts library with motors, servos and microcontroller boards. Beginners are welcome, and volunteer mentors run a free introduction session every Saturday morning.

## Opening hours
The lab is open Monday to Friday from 9:00 to 21:00 and on Saturday from 10:00 to 16:00. It is closed on Sundays and public holidays. During exam weeks the lab closes early at 18:00. Members with a gold card can request after-hours access by booking at least two days in advance.

## Membership
Student membership costs Rp 50.000 per semester and staff membership costs Rp 100.000 per semester. A gold card costs Rp 250.000 per year and includes after-hours access and priority booking for the laser cutter. You can pay at the front desk by cash or QRIS. Membership cards must be shown at the entrance on every visit.

## Borrowing equipment
Members may borrow up to three items at a time for a maximum of seven days. Oscilloscopes and the drone kit cannot leave the lab. Late returns are charged Rp 5.000 per item per day. Damaged equipment must be reported to a lab assistant on the same day, and repair costs may be shared with the borrower.

## 3D printing
The lab has a Prusa printer and a resin printer. PLA prints cost Rp 2.000 per gram of filament and resin prints cost Rp 6.000 per millilitre. Upload your STL file to the print queue and a lab assistant will check it before printing. Prints longer than eight hours must be booked for an overnight slot.

## Safety rules
Wear safety glasses when soldering, cutting or drilling. Closed shoes are required in the workshop area. Never leave the laser cutter running unattended, and keep the fire extinguisher by the door clear at all times. Lithium batteries must be charged inside the fireproof charging bags. Food and drinks are only allowed in the lounge.

## Wi-Fi and computers
Connect to the network NusaBot-Lab using your student ID as the username. The six workstations have Arduino IDE, KiCad, Fusion 360 and Python installed. Files saved on the workstations are deleted every Sunday night, so keep your work on a USB drive or in the cloud. Printing paper documents costs Rp 500 per page.

## Contact
Questions about membership or bookings can be sent to the front desk by WhatsApp. For urgent safety issues during opening hours, ask the lab assistant on duty, who wears a green vest. The lab coordinator, Ms. Rahma, holds office hours on Tuesday afternoons for project advice and research collaborations.`;

export const NUSABOT_ID = `## Tentang lab
NusaBot Robotics Lab adalah ruang kreasi bersama untuk mahasiswa dan peneliti. Anggota membuat robot, sensor dan proyek elektronika kecil. Lab memiliki stasiun solder, mesin pemotong laser, dua printer 3D dan perpustakaan komponen berisi motor, servo dan papan mikrokontroler. Pemula dipersilakan bergabung, dan mentor relawan mengadakan sesi pengenalan gratis setiap Sabtu pagi.

## Jam buka
Lab buka Senin sampai Jumat pukul 09.00 sampai 21.00 dan hari Sabtu pukul 10.00 sampai 16.00. Lab tutup pada hari Minggu dan hari libur nasional. Selama pekan ujian lab tutup lebih awal pukul 18.00. Anggota kartu emas dapat meminta akses di luar jam buka dengan memesan paling lambat dua hari sebelumnya.

## Keanggotaan
Keanggotaan mahasiswa dikenakan biaya Rp 50.000 per semester dan keanggotaan staf Rp 100.000 per semester. Kartu emas dikenakan biaya Rp 250.000 per tahun dan mencakup akses di luar jam buka serta prioritas pemesanan mesin pemotong laser. Pembayaran dilakukan di meja depan secara tunai atau QRIS. Kartu anggota wajib ditunjukkan di pintu masuk setiap kunjungan.

## Peminjaman alat
Anggota boleh meminjam paling banyak tiga alat sekaligus selama maksimal tujuh hari. Osiloskop dan kit drone tidak boleh dibawa keluar lab. Anggota yang terlambat mengembalikan alat dikenakan denda Rp 5.000 per alat per hari. Alat yang rusak wajib dilaporkan kepada asisten lab pada hari yang sama, dan biaya perbaikan dapat dibebankan sebagian kepada peminjam.

## Cetak 3D
Lab memiliki printer Prusa dan printer resin. Cetak PLA dikenakan biaya Rp 2.000 per gram filamen dan cetak resin Rp 6.000 per mililiter. Unggah file STL ke antrean cetak dan asisten lab akan memeriksanya sebelum dicetak. Cetakan yang lebih dari delapan jam wajib dipesan untuk slot malam.

## Aturan keselamatan
Gunakan kacamata pelindung saat menyolder, memotong atau mengebor. Sepatu tertutup wajib dipakai di area bengkel. Jangan tinggalkan mesin pemotong laser menyala tanpa pengawasan, dan jaga agar alat pemadam api di dekat pintu selalu bebas halangan. Baterai litium wajib diisi di dalam kantong pengisian tahan api. Makanan dan minuman hanya diperbolehkan di ruang santai.

## Wi-Fi dan komputer
Sambungkan ke jaringan NusaBot-Lab dengan NIM sebagai nama pengguna. Enam komputer kerja sudah terpasang Arduino IDE, KiCad, Fusion 360 dan Python. File yang disimpan di komputer kerja dihapus setiap Minggu malam, jadi simpan pekerjaan Anda di flashdisk atau cloud. Mencetak dokumen kertas dikenakan biaya Rp 500 per halaman.

## Kontak
Pertanyaan tentang keanggotaan atau pemesanan dapat dikirim ke meja depan melalui WhatsApp. Untuk masalah keselamatan yang mendesak selama jam buka, hubungi asisten lab yang bertugas, yang memakai rompi hijau. Koordinator lab, Rahma Putri, membuka jam konsultasi setiap Selasa sore untuk saran proyek dan kolaborasi riset.`;

export const DOCUMENTS = {
  "nusabot-en": { lang: "en", title: "NusaBot Lab handbook (English)", text: NUSABOT_EN },
  "nusabot-id": { lang: "id", title: "Buku panduan NusaBot Lab (Indonesia)", text: NUSABOT_ID },
};
