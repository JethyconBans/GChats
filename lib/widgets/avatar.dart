import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

class GAvatar extends StatelessWidget {
  const GAvatar({
    super.key,
    required this.name,
    this.url,
    this.radius = 24,
    this.online = false,
  });

  final String name;
  final String? url;
  final double radius;
  final bool online;

  @override
  Widget build(BuildContext context) {
    final imageUrl = url ?? '';
    return Stack(
      clipBehavior: Clip.none,
      children: [
        CircleAvatar(
          radius: radius,
          backgroundColor: Theme.of(context).colorScheme.primaryContainer,
          backgroundImage: imageUrl.isEmpty ? null : CachedNetworkImageProvider(imageUrl),
          child: imageUrl.isEmpty
              ? Text(
                  name.isEmpty ? '?' : name[0].toUpperCase(),
                  style: TextStyle(fontSize: radius * .75, fontWeight: FontWeight.w700),
                )
              : null,
        ),
        if (online)
          Positioned(
            right: -1,
            bottom: -1,
            child: Container(
              width: radius * .48,
              height: radius * .48,
              decoration: BoxDecoration(
                color: const Color(0xFF31A24C),
                shape: BoxShape.circle,
                border: Border.all(color: Theme.of(context).scaffoldBackgroundColor, width: 2),
              ),
            ),
          ),
      ],
    );
  }
}
