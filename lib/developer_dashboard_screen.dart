import 'package:flutter/material.dart';

class DeveloperDashboardScreen extends StatelessWidget {
  const DeveloperDashboardScreen({super.key});

  static const Color _purple = Color(0xFF6D28D9);
  static const Color _cardColor = Color(0xFF241B37);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'غرفة التحكم العليا للمطور 👑',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
        ),
        backgroundColor: _purple,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.amber.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.amber.shade700),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.info_outline, color: Colors.amber),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'واجهة تجريبية: لا يوجد حالياً تسجيل دخول للمطور أو ربط ببيانات مالية مباشرة. الأرقام والتنبيهات أدناه أمثلة فقط.',
                    style: TextStyle(height: 1.5),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Card(
            color: _cardColor,
            child: const Padding(
              padding: EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.account_balance_wallet, color: Colors.white70),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'صافي أرباح المنصة من السعي',
                          style: TextStyle(color: Colors.white70),
                        ),
                      ),
                      _DemoBadge(),
                    ],
                  ),
                  SizedBox(height: 18),
                  Text(
                    '184,500 ريال',
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.bold,
                      color: Colors.greenAccent,
                    ),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'قيمة توضيحية فقط — لا تمثل رصيداً أو أرباحاً فعلية.',
                    style: TextStyle(color: Colors.white60, fontSize: 12),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          const Text(
            '🚨 تنبيهات الأمان',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 10),
          Card(
            color: const Color(0xFF5F1717),
            child: const ListTile(
              leading: Icon(Icons.warning_amber_rounded, color: Colors.white),
              title: Text('تنبيه تجريبي: رصد عبارة غير مسموح بها في محادثة'),
              subtitle: Padding(
                padding: EdgeInsets.only(top: 6),
                child: Text(
                  'مثال للعرض فقط. لا توجد مراقبة مباشرة متصلة بهذه الشاشة.',
                ),
              ),
              isThreeLine: true,
            ),
          ),
          const SizedBox(height: 20),
          const Text(
            'توزيع السعي (مثال)',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 10),
          const _DistributionCard(
            label: 'حصة المنصة',
            percentage: '50%',
            color: Colors.deepPurpleAccent,
          ),
          const _DistributionCard(
            label: 'الساعي الرئيسي',
            percentage: '30%',
            color: Colors.blueAccent,
          ),
          const _DistributionCard(
            label: 'المسوقون الإضافيون',
            percentage: '20%',
            color: Colors.tealAccent,
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

class _DemoBadge extends StatelessWidget {
  const _DemoBadge();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.amber.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(20),
      ),
      child: const Padding(
        padding: EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        child: Text(
          'تجريبي',
          style: TextStyle(
            color: Colors.amber,
            fontSize: 12,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }
}

class _DistributionCard extends StatelessWidget {
  const _DistributionCard({
    required this.label,
    required this.percentage,
    required this.color,
  });

  final String label;
  final String percentage;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(Icons.pie_chart_outline, color: color),
        title: Text(label),
        trailing: Text(
          percentage,
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.bold,
            fontSize: 16,
          ),
        ),
      ),
    );
  }
}
